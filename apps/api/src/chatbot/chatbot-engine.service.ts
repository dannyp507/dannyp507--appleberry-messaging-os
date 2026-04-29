import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  forwardRef,
} from '@nestjs/common';
import {
  ChatbotNodeType,
  ChatbotRunStatus,
  ChatbotFlowStatus,
  WhatsAppProviderType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MessagesService } from '../messages/messages.service';
import { AiService } from '../ai/ai.service';
import { IntegrationsService } from '../integrations/integrations.service';

type JsonRecord = Record<string, unknown>;

@Injectable()
export class ChatbotEngineService {
  private readonly logger = new Logger(ChatbotEngineService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => MessagesService))
    private readonly messages: MessagesService,
    private readonly ai: AiService,
    private readonly integrations: IntegrationsService,
  ) {}

  private readVars(run: { variables: unknown }): Record<string, string> {
    const v = run.variables as JsonRecord;
    const out: Record<string, string> = {};
    if (v && typeof v === 'object') {
      for (const [k, val] of Object.entries(v)) {
        if (val === undefined || val === null) continue;
        out[k] = String(val);
      }
    }
    return out;
  }

  private async writeVars(runId: string, next: Record<string, string>) {
    await this.prisma.chatbotRun.update({
      where: { id: runId },
      data: { variables: next },
    });
  }

  /**
   * Resolve a template string like "Hello {{name}}, your service is {{service}}"
   * using the current run variables.
   */
  private interpolate(template: string, vars: Record<string, string>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? '');
  }

  async startFlow(params: {
    workspaceId: string;
    whatsappAccountId: string;
    contactId: string;
    flowId: string;
    inboxThreadId?: string | null;
  }) {
    const flow = await this.prisma.chatbotFlow.findFirst({
      where: {
        id: params.flowId,
        workspaceId: params.workspaceId,
        status: ChatbotFlowStatus.ACTIVE,
      },
      include: { entryNode: true },
    });
    if (!flow?.entryNodeId || !flow.entryNode) {
      throw new BadRequestException('Flow is not active or missing entry node');
    }

    await this.prisma.chatbotRun.updateMany({
      where: {
        workspaceId: params.workspaceId,
        contactId: params.contactId,
        status: ChatbotRunStatus.ACTIVE,
      },
      data: { status: ChatbotRunStatus.COMPLETED, currentNodeId: null },
    });

    const run = await this.prisma.chatbotRun.create({
      data: {
        workspaceId: params.workspaceId,
        flowId: flow.id,
        contactId: params.contactId,
        currentNodeId: flow.entryNodeId,
        status: ChatbotRunStatus.ACTIVE,
        variables: {},
      },
    });

    await this.processUntilWait(run.id, params);
    return run;
  }

  /**
   * Returns true if the inbound text was consumed by an active QUESTION step.
   */
  async handleIncomingMessage(params: {
    workspaceId: string;
    whatsappAccountId: string;
    contactId: string;
    text: string;
    inboxThreadId?: string | null;
  }): Promise<boolean> {
    const run = await this.prisma.chatbotRun.findFirst({
      where: {
        workspaceId: params.workspaceId,
        contactId: params.contactId,
        status: ChatbotRunStatus.ACTIVE,
      },
      include: { currentNode: true },
    });
    if (!run?.currentNode) return false;

    // These node types pause execution and wait for user input
    const waitTypes: ChatbotNodeType[] = [
      ChatbotNodeType.QUESTION,
      ChatbotNodeType.BUTTONS,
      ChatbotNodeType.LIST,
    ];
    if (!waitTypes.includes(run.currentNode.type)) return false;

    const vars = this.readVars(run);
    const content = (run.currentNode.content ?? {}) as JsonRecord;

    // ── Resolve input to the canonical value expected by downstream CONDITION nodes ──
    let resolvedInput = params.text.trim();

    if (run.currentNode.type === ChatbotNodeType.BUTTONS) {
      // Buttons: numeric "1"/"2"/"3" → button id; label text → button id
      const buttons = Array.isArray(content.buttons)
        ? (content.buttons as Array<{ id: string; label: string }>)
        : [];
      const num = parseInt(resolvedInput, 10);
      if (!isNaN(num) && num >= 1 && num <= buttons.length) {
        resolvedInput = buttons[num - 1].id;
      } else {
        const byLabel = buttons.find(
          (b) => b.label.trim().toLowerCase() === resolvedInput.toLowerCase(),
        );
        if (byLabel) resolvedInput = byLabel.id;
      }
    }

    if (run.currentNode.type === ChatbotNodeType.LIST) {
      // List: numeric input → row id; row title → row id
      const sections = Array.isArray(content.sections)
        ? (content.sections as Array<{ rows: Array<{ id: string; title: string }> }>)
        : [];
      const allRows = sections.flatMap((s) => s.rows);
      const num = parseInt(resolvedInput, 10);
      if (!isNaN(num) && num >= 1 && num <= allRows.length) {
        resolvedInput = allRows[num - 1].id;
      } else {
        const byTitle = allRows.find(
          (r) => r.title.trim().toLowerCase() === resolvedInput.toLowerCase(),
        );
        if (byTitle) resolvedInput = byTitle.id;
      }
    }

    const key =
      typeof content.variableKey === 'string'
        ? content.variableKey
        : 'answer';
    vars[key] = resolvedInput;
    vars.lastInput = resolvedInput;
    await this.writeVars(run.id, vars);

    const nextNodeId = await this.pickNextLinear(run.currentNode.id);
    if (!nextNodeId) {
      await this.completeRun(run.id);
      return true;
    }

    await this.prisma.chatbotRun.update({
      where: { id: run.id },
      data: { currentNodeId: nextNodeId },
    });

    const reloaded = await this.prisma.chatbotRun.findUniqueOrThrow({
      where: { id: run.id },
    });
    await this.processUntilWait(reloaded.id, params);
    return true;
  }

  async moveToNextNode(runId: string, input?: string | null) {
    const run = await this.prisma.chatbotRun.findUniqueOrThrow({
      where: { id: runId },
      include: { contact: true },
    });
    const account = await this.prisma.whatsAppAccount.findFirst({
      where: { workspaceId: run.workspaceId },
      orderBy: { createdAt: 'asc' },
    });
    if (!account) {
      throw new BadRequestException('No WhatsApp account for workspace');
    }
    const vars = this.readVars(run);
    if (input != null && input !== '') {
      vars.lastInput = input.trim();
      await this.writeVars(run.id, vars);
    }
    await this.processUntilWait(run.id, {
      workspaceId: run.workspaceId,
      whatsappAccountId: account.id,
      contactId: run.contactId,
      inboxThreadId: null,
    });
  }

  private async processUntilWait(
    runId: string,
    ctx: {
      workspaceId: string;
      whatsappAccountId: string;
      contactId: string;
      inboxThreadId?: string | null;
    },
  ) {
    for (let guard = 0; guard < 50; guard += 1) {
      const run = await this.prisma.chatbotRun.findUnique({
        where: { id: runId },
        include: { currentNode: true, contact: true, flow: true },
      });
      if (!run || run.status !== ChatbotRunStatus.ACTIVE || !run.currentNode) {
        return;
      }

      const node = run.currentNode;
      const accountId =
        ctx.whatsappAccountId ||
        (await this.prisma.whatsAppAccount.findFirst({
          where: { workspaceId: run.workspaceId },
          orderBy: { createdAt: 'asc' },
        }))?.id;
      if (!accountId) {
        this.logger.warn(`No WhatsApp account for workspace ${run.workspaceId}`);
        await this.completeRun(runId);
        return;
      }

      const sendCtx = { ...ctx, whatsappAccountId: accountId };

      switch (node.type) {
        // ── Text message ────────────────────────────────────────────────────
        case ChatbotNodeType.TEXT: {
          const content = (node.content ?? {}) as JsonRecord;
          const vars = this.readVars(run);
          const raw = typeof content.text === 'string' ? content.text : '';
          const text = this.interpolate(raw, vars);
          if (text) {
            await this.messages.enqueueOutboundText({
              workspaceId: run.workspaceId,
              whatsappAccountId: accountId,
              to: run.contact.phone,
              message: text,
              contactId: run.contactId,
              inboxThreadId: sendCtx.inboxThreadId ?? null,
            });
          }
          const next = await this.pickNextLinear(node.id);
          if (!next) { await this.completeRun(runId); return; }
          await this.prisma.chatbotRun.update({ where: { id: runId }, data: { currentNodeId: next } });
          continue;
        }

        // ── Interactive buttons (up to 3) — waits for user tap ──────────────
        case ChatbotNodeType.BUTTONS: {
          const content = (node.content ?? {}) as JsonRecord;
          const vars = this.readVars(run);
          const raw = typeof content.prompt === 'string' ? content.prompt : '';
          const prompt = this.interpolate(raw, vars);
          const buttons = Array.isArray(content.buttons)
            ? (content.buttons as Array<{ id: string; label: string }>)
            : [];

          // Check if this account supports Cloud API interactive messages
          const acct = await this.prisma.whatsAppAccount.findUnique({
            where: { id: accountId },
            select: { providerType: true },
          });

          if (acct?.providerType === WhatsAppProviderType.CLOUD && buttons.length > 0) {
            // Real WhatsApp button UI
            await this.messages.enqueueOutboundInteractive({
              workspaceId: run.workspaceId,
              whatsappAccountId: accountId,
              to: run.contact.phone,
              interactive: {
                type: 'button',
                body: { text: prompt || 'Please choose an option:' },
                action: {
                  buttons: buttons.slice(0, 3).map((b) => ({
                    type: 'reply' as const,
                    reply: { id: b.id, title: b.label.slice(0, 20) },
                  })),
                },
              },
              contactId: run.contactId,
              inboxThreadId: sendCtx.inboxThreadId ?? null,
            });
          } else {
            // Text fallback: numbered list (Baileys / Mock)
            const lines = buttons.map((b, i) => `${i + 1}. ${b.label}`).join('\n');
            const fullMsg = prompt ? `${prompt}\n\n${lines}` : lines;
            if (fullMsg.trim()) {
              await this.messages.enqueueOutboundText({
                workspaceId: run.workspaceId,
                whatsappAccountId: accountId,
                to: run.contact.phone,
                message: fullMsg,
                contactId: run.contactId,
                inboxThreadId: sendCtx.inboxThreadId ?? null,
              });
            }
          }
          return; // pause — wait for button tap or text reply
        }

        // ── List picker (up to 10 items) — waits for user selection ─────────
        case ChatbotNodeType.LIST: {
          const content = (node.content ?? {}) as JsonRecord;
          const vars = this.readVars(run);
          const raw = typeof content.prompt === 'string' ? content.prompt : '';
          const prompt = this.interpolate(raw, vars);
          const btnText =
            typeof content.buttonText === 'string' ? content.buttonText : 'See options';
          const sections = Array.isArray(content.sections)
            ? (content.sections as Array<{
                title?: string;
                rows: Array<{ id: string; title: string; description?: string }>;
              }>)
            : [];

          const acct2 = await this.prisma.whatsAppAccount.findUnique({
            where: { id: accountId },
            select: { providerType: true },
          });

          if (acct2?.providerType === WhatsAppProviderType.CLOUD && sections.length > 0) {
            // Real WhatsApp list picker
            await this.messages.enqueueOutboundInteractive({
              workspaceId: run.workspaceId,
              whatsappAccountId: accountId,
              to: run.contact.phone,
              interactive: {
                type: 'list',
                body: { text: prompt || 'Please select an option:' },
                action: {
                  button: btnText.slice(0, 20),
                  sections: sections.map((s) => ({
                    ...(s.title ? { title: s.title.slice(0, 24) } : {}),
                    rows: s.rows.slice(0, 10).map((r) => ({
                      id: r.id,
                      title: r.title.slice(0, 24),
                      ...(r.description ? { description: r.description.slice(0, 72) } : {}),
                    })),
                  })),
                },
              },
              contactId: run.contactId,
              inboxThreadId: sendCtx.inboxThreadId ?? null,
            });
          } else {
            // Text fallback: numbered list
            let counter = 0;
            const lines: string[] = [];
            for (const section of sections) {
              if (section.title) lines.push(`*${section.title}*`);
              for (const row of section.rows) {
                counter++;
                const desc = row.description ? ` — ${row.description}` : '';
                lines.push(`${counter}. ${row.title}${desc}`);
              }
            }
            const fullMsg = prompt
              ? `${prompt}\n\n${lines.join('\n')}`
              : lines.join('\n');
            if (fullMsg.trim()) {
              await this.messages.enqueueOutboundText({
                workspaceId: run.workspaceId,
                whatsappAccountId: accountId,
                to: run.contact.phone,
                message: fullMsg,
                contactId: run.contactId,
                inboxThreadId: sendCtx.inboxThreadId ?? null,
              });
            }
          }
          return; // pause — wait for selection or text reply
        }

        // ── Question (waits for user reply) ─────────────────────────────────
        case ChatbotNodeType.QUESTION: {
          const content = (node.content ?? {}) as JsonRecord;
          const vars = this.readVars(run);
          const raw = typeof content.prompt === 'string' ? content.prompt : '';
          const prompt = this.interpolate(raw, vars);
          if (prompt) {
            await this.messages.enqueueOutboundText({
              workspaceId: run.workspaceId,
              whatsappAccountId: accountId,
              to: run.contact.phone,
              message: prompt,
              contactId: run.contactId,
              inboxThreadId: sendCtx.inboxThreadId ?? null,
            });
          }
          return; // wait for next inbound message
        }

        // ── Condition branch ────────────────────────────────────────────────
        case ChatbotNodeType.CONDITION: {
          const vars = this.readVars(run);
          const cnd = (node.content ?? {}) as JsonRecord;
          const key = typeof cnd.variableKey === 'string' ? cnd.variableKey : 'lastInput';
          const value = vars[key] ?? '';
          const next = await this.pickConditionEdge(node.id, value);
          if (!next) { await this.completeRun(runId); return; }
          await this.prisma.chatbotRun.update({ where: { id: runId }, data: { currentNodeId: next } });
          continue;
        }

        // ── Webhook / Tag action ─────────────────────────────────────────────
        case ChatbotNodeType.WEBHOOK: {
          await this.executeTagAction(run.workspaceId, run.contactId, node.content);
          const next = await this.pickNextLinear(node.id);
          if (!next) { await this.completeRun(runId); return; }
          await this.prisma.chatbotRun.update({ where: { id: runId }, data: { currentNodeId: next } });
          continue;
        }

        // ── AI Reply ────────────────────────────────────────────────────────
        case ChatbotNodeType.AI_REPLY: {
          const content = (node.content ?? {}) as JsonRecord;
          const systemPrompt = typeof content.systemPrompt === 'string' ? content.systemPrompt : undefined;
          const thread = await this.prisma.inboxThread.findFirst({
            where: { workspaceId: run.workspaceId, contactId: run.contactId },
            orderBy: { updatedAt: 'desc' },
            include: { messages: { orderBy: { createdAt: 'desc' }, take: 10 } },
          });
          const recentMessages = (thread?.messages ?? [])
            .reverse()
            .map((m) => ({ direction: m.direction, message: m.message }));
          const vars = this.readVars(run);
          const reply = await this.ai.generateReply(
            { workspaceId: run.workspaceId, contactId: run.contactId, recentMessages },
            vars.lastInput ?? '',
            systemPrompt,
          );
          if (reply) {
            await this.messages.enqueueOutboundText({
              workspaceId: run.workspaceId,
              whatsappAccountId: accountId,
              to: run.contact.phone,
              message: reply,
              contactId: run.contactId,
              inboxThreadId: sendCtx.inboxThreadId ?? null,
            });
          }
          const aiNext = await this.pickNextLinear(node.id);
          if (!aiNext) { await this.completeRun(runId); return; }
          await this.prisma.chatbotRun.update({ where: { id: runId }, data: { currentNodeId: aiNext } });
          continue;
        }

        // ── Save to Google Sheet ─────────────────────────────────────────────
        case ChatbotNodeType.SAVE_TO_SHEET: {
          const content = (node.content ?? {}) as JsonRecord;
          const vars = this.readVars(run);

          // Build lead data from field mappings: { sheetColumn: "{{variableKey}}" }
          // Also auto-populate contact fields
          const fieldMap = (content.fields ?? {}) as Record<string, string>;
          const leadData: Record<string, string> = {
            firstName: run.contact.firstName ?? '',
            lastName:  run.contact.lastName  ?? '',
            phone:     run.contact.phone     ?? '',
            email:     run.contact.email     ?? '',
            timestamp: new Date().toISOString(),
          };

          // Merge with mapped fields (values are interpolated templates)
          for (const [col, template] of Object.entries(fieldMap)) {
            if (typeof template === 'string') {
              leadData[col] = this.interpolate(template, vars);
            }
          }

          try {
            await this.integrations.appendLeadRow(run.workspaceId, leadData);
            this.logger.log(`SAVE_TO_SHEET: saved row for contact ${run.contactId}`);
          } catch (err) {
            this.logger.error(`SAVE_TO_SHEET failed for workspace ${run.workspaceId}: ${err}`);
            // Non-fatal — continue flow even if Sheets is not configured
          }

          const next = await this.pickNextLinear(node.id);
          if (!next) { await this.completeRun(runId); return; }
          await this.prisma.chatbotRun.update({ where: { id: runId }, data: { currentNodeId: next } });
          continue;
        }

        // ── Check Calendar Availability ───────────────────────────────────────
        case ChatbotNodeType.CHECK_CALENDAR: {
          const content  = (node.content ?? {}) as JsonRecord;
          const vars     = this.readVars(run);

          const dateVar   = typeof content.dateVariable   === 'string' ? content.dateVariable   : 'date';
          const hourVar   = typeof content.hourVariable   === 'string' ? content.hourVariable   : 'hour';
          const resultVar = typeof content.resultVariable === 'string' ? content.resultVariable : 'availability';

          const dateStr = vars[dateVar] ?? '';
          const hourRaw = vars[hourVar] ?? '';
          const hour    = parseInt(hourRaw, 10) || 10;

          let availabilityMsg = 'I could not check the calendar. Please call us to book.';

          try {
            const result = await this.integrations.checkAvailability(run.workspaceId, {
              date: dateStr,
              hour,
            });

            if (result.available) {
              availabilityMsg = `Great news! ${dateStr} at ${hour}:00 is available.`;
              vars[resultVar] = 'available';
              vars['availableDate'] = dateStr;
              vars['availableHour'] = String(hour);
            } else if (result.nextSlot) {
              const ns = result.nextSlot as { date: string; hour: number };
              availabilityMsg = `That slot is taken. The next available slot is ${ns.date} at ${ns.hour}:00. Would you like to book that instead?`;
              vars[resultVar] = 'next_slot';
              vars['availableDate'] = ns.date;
              vars['availableHour'] = String(ns.hour);
            } else {
              availabilityMsg = 'Unfortunately there are no available slots in the near future. Please contact us directly.';
              vars[resultVar] = 'unavailable';
            }
          } catch (err) {
            this.logger.error(`CHECK_CALENDAR failed for workspace ${run.workspaceId}: ${err}`);
            vars[resultVar] = 'error';
          }

          // Store availability message so the next TEXT/QUESTION node can use {{availability}}
          vars['availabilityMessage'] = availabilityMsg;
          await this.writeVars(runId, vars);

          const next = await this.pickNextLinear(node.id);
          if (!next) { await this.completeRun(runId); return; }
          await this.prisma.chatbotRun.update({ where: { id: runId }, data: { currentNodeId: next } });
          continue;
        }

        // ── Create Booking ────────────────────────────────────────────────────
        case ChatbotNodeType.CREATE_BOOKING: {
          const content = (node.content ?? {}) as JsonRecord;
          const vars    = this.readVars(run);

          const nameVar    = typeof content.nameVariable    === 'string' ? content.nameVariable    : 'name';
          const emailVar   = typeof content.emailVariable   === 'string' ? content.emailVariable   : 'email';
          const serviceVar = typeof content.serviceVariable === 'string' ? content.serviceVariable : 'service';
          const dateVar    = typeof content.dateVariable    === 'string' ? content.dateVariable    : 'availableDate';
          const hourVar    = typeof content.hourVariable    === 'string' ? content.hourVariable    : 'availableHour';
          const resultVar  = typeof content.resultVariable  === 'string' ? content.resultVariable  : 'bookingLink';

          const name    = vars[nameVar]    || `${run.contact.firstName ?? ''} ${run.contact.lastName ?? ''}`.trim() || 'Customer';
          const email   = vars[emailVar]   || run.contact.email || '';
          const service = vars[serviceVar] || 'Appointment';
          const date    = vars[dateVar]    || '';
          const hour    = parseInt(vars[hourVar] ?? '10', 10) || 10;

          let confirmMsg = 'Your booking has been confirmed! We will send you a calendar invite.';

          try {
            // Build ISO datetime: "2025-06-15T10:00:00"
            const startTime = date
              ? `${date}T${String(hour).padStart(2, '0')}:00:00`
              : new Date().toISOString();

            const booking = await this.integrations.createBooking(run.workspaceId, {
              title:         `${service} — ${name}`,
              startTime,
              customerName:  name,
              customerEmail: email || undefined,
              notes:         `Booked via WhatsApp chatbot flow`,
            });

            const link = (booking as { htmlLink?: string }).htmlLink ?? '';
            vars[resultVar] = link;
            vars['bookingConfirmation'] = link
              ? `✅ Booking confirmed! View your appointment: ${link}`
              : '✅ Booking confirmed! You will receive a calendar invite shortly.';
            confirmMsg = vars['bookingConfirmation'];

            this.logger.log(`CREATE_BOOKING: booked for contact ${run.contactId} on ${date} at ${hour}:00`);
          } catch (err) {
            this.logger.error(`CREATE_BOOKING failed for workspace ${run.workspaceId}: ${err}`);
            vars[resultVar] = '';
            vars['bookingConfirmation'] = '❌ Sorry, we could not complete the booking. Please contact us directly.';
            confirmMsg = vars['bookingConfirmation'];
          }

          await this.writeVars(runId, vars);

          // Send confirmation message immediately
          await this.messages.enqueueOutboundText({
            workspaceId:        run.workspaceId,
            whatsappAccountId:  accountId,
            to:                 run.contact.phone,
            message:            confirmMsg,
            contactId:          run.contactId,
            inboxThreadId:      sendCtx.inboxThreadId ?? null,
          });

          const next = await this.pickNextLinear(node.id);
          if (!next) { await this.completeRun(runId); return; }
          await this.prisma.chatbotRun.update({ where: { id: runId }, data: { currentNodeId: next } });
          continue;
        }

        default:
          // Unknown node type — skip to next linear node
          this.logger.warn(`Unknown node type: ${node.type as string} — skipping`);
          const skipNext = await this.pickNextLinear(node.id);
          if (!skipNext) { await this.completeRun(runId); return; }
          await this.prisma.chatbotRun.update({ where: { id: runId }, data: { currentNodeId: skipNext } });
          continue;
      }
    }
  }

  private async pickNextLinear(fromNodeId: string): Promise<string | null> {
    const edge = await this.prisma.chatbotEdge.findFirst({
      where: { fromNodeId },
      orderBy: { createdAt: 'asc' },
    });
    return edge?.toNodeId ?? null;
  }

  private async pickConditionEdge(
    fromNodeId: string,
    value: string,
  ): Promise<string | null> {
    const edges = await this.prisma.chatbotEdge.findMany({
      where: { fromNodeId },
      orderBy: { createdAt: 'asc' },
    });
    for (const e of edges) {
      const cond = e.condition as { equals?: string } | null;
      if (cond?.equals != null) {
        if (value.trim().toLowerCase() === String(cond.equals).toLowerCase()) {
          return e.toNodeId;
        }
      }
    }
    const fallback = edges.find((e) => !e.condition);
    return fallback?.toNodeId ?? null;
  }

  private async executeTagAction(
    workspaceId: string,
    contactId: string,
    content: unknown,
  ) {
    const c = (content ?? {}) as JsonRecord;
    const type = typeof c.type === 'string' ? c.type : '';
    if (type === 'TAG') {
      const name = typeof c.tagName === 'string' ? c.tagName : '';
      if (!name) return;
      const tag = await this.prisma.tag.upsert({
        where: { workspaceId_name: { workspaceId, name } },
        update: {},
        create: { workspaceId, name },
      });
      await this.prisma.contactTag.upsert({
        where: { contactId_tagId: { contactId, tagId: tag.id } },
        update: {},
        create: { contactId, tagId: tag.id },
      });
    }
  }

  private async completeRun(runId: string) {
    await this.prisma.chatbotRun.update({
      where: { id: runId },
      data: { status: ChatbotRunStatus.COMPLETED, currentNodeId: null },
    });
  }
}
