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
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MessagesService } from '../messages/messages.service';
import { AiService } from '../ai/ai.service';

type JsonRecord = Record<string, unknown>;

@Injectable()
export class ChatbotEngineService {
  private readonly logger = new Logger(ChatbotEngineService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => MessagesService))
    private readonly messages: MessagesService,
    private readonly ai: AiService,
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
    if (!run?.currentNode) {
      return false;
    }
    const waitingTypes: ChatbotNodeType[] = [
      ChatbotNodeType.QUESTION,
      ChatbotNodeType.BUTTONS,
      ChatbotNodeType.LIST,
    ];
    if (!waitingTypes.includes(run.currentNode.type)) {
      return false;
    }

    const vars = this.readVars(run);
    const content = (run.currentNode.content ?? {}) as JsonRecord;
    const key =
      typeof content.variableKey === 'string'
        ? content.variableKey
        : 'answer';
    vars[key] = params.text.trim();
    vars.lastInput = params.text.trim();
    await this.writeVars(run.id, vars);

    // BUTTONS and LIST route by condition edge (matching button/row ID); QUESTION advances linearly
    const isInteractive =
      run.currentNode.type === ChatbotNodeType.BUTTONS ||
      run.currentNode.type === ChatbotNodeType.LIST;

    const nextNodeId = isInteractive
      ? await this.pickConditionEdge(run.currentNode.id, params.text.trim())
      : await this.pickNextLinear(run.currentNode.id);

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

      const sendCtx = {
        ...ctx,
        whatsappAccountId: accountId,
      };

      switch (node.type) {
        case ChatbotNodeType.TEXT: {
          const content = (node.content ?? {}) as JsonRecord;
          const text =
            typeof content.text === 'string' ? content.text : '';
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
          if (!next) {
            await this.completeRun(runId);
            return;
          }
          await this.prisma.chatbotRun.update({
            where: { id: runId },
            data: { currentNodeId: next },
          });
          continue;
        }
        case ChatbotNodeType.QUESTION: {
          const content = (node.content ?? {}) as JsonRecord;
          const prompt =
            typeof content.prompt === 'string' ? content.prompt : '';
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
          return;
        }
        case ChatbotNodeType.CONDITION: {
          const vars = this.readVars(run);
          const cnd = (node.content ?? {}) as JsonRecord;
          const key =
            typeof cnd.variableKey === 'string' ? cnd.variableKey : 'lastInput';
          const value = vars[key] ?? '';
          const next = await this.pickConditionEdge(node.id, value);
          if (!next) {
            await this.completeRun(runId);
            return;
          }
          await this.prisma.chatbotRun.update({
            where: { id: runId },
            data: { currentNodeId: next },
          });
          continue;
        }
        case ChatbotNodeType.WEBHOOK: {
          await this.executeAction(run.workspaceId, run.contactId, node.content);
          const next = await this.pickNextLinear(node.id);
          if (!next) {
            await this.completeRun(runId);
            return;
          }
          await this.prisma.chatbotRun.update({
            where: { id: runId },
            data: { currentNodeId: next },
          });
          continue;
        }
        case ChatbotNodeType.AI_REPLY: {
          const content = (node.content ?? {}) as JsonRecord;
          const systemPrompt =
            typeof content.systemPrompt === 'string'
              ? content.systemPrompt
              : undefined;

          // Gather last 10 inbox messages as context
          const thread = await this.prisma.inboxThread.findFirst({
            where: { workspaceId: run.workspaceId, contactId: run.contactId },
            orderBy: { updatedAt: 'desc' },
            include: {
              messages: {
                orderBy: { createdAt: 'desc' },
                take: 10,
              },
            },
          });
          const recentMessages = (thread?.messages ?? [])
            .reverse()
            .map((m) => ({ direction: m.direction, message: m.message }));

          const vars = this.readVars(run);
          const lastInput = vars.lastInput ?? '';

          const reply = await this.ai.generateReply(
            {
              workspaceId: run.workspaceId,
              contactId: run.contactId,
              recentMessages,
            },
            lastInput,
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
          if (!aiNext) {
            await this.completeRun(runId);
            return;
          }
          await this.prisma.chatbotRun.update({
            where: { id: runId },
            data: { currentNodeId: aiNext },
          });
          continue;
        }
        case ChatbotNodeType.MEDIA: {
          const content = (node.content ?? {}) as JsonRecord;
          const mediaUrl = typeof content.url === 'string' ? content.url : '';
          const caption = typeof content.caption === 'string' ? content.caption : undefined;
          if (mediaUrl) {
            await this.messages.enqueueOutboundText({
              workspaceId: run.workspaceId,
              whatsappAccountId: accountId,
              to: run.contact.phone,
              message: caption ?? '',
              contactId: run.contactId,
              inboxThreadId: sendCtx.inboxThreadId ?? null,
              mediaUrl,
            });
          }
          const mediaNext = await this.pickNextLinear(node.id);
          if (!mediaNext) { await this.completeRun(runId); return; }
          await this.prisma.chatbotRun.update({ where: { id: runId }, data: { currentNodeId: mediaNext } });
          continue;
        }
        case ChatbotNodeType.BUTTONS: {
          const content = (node.content ?? {}) as JsonRecord;
          const body = typeof content.body === 'string' ? content.body : '';
          const header = typeof content.header === 'string' ? content.header : undefined;
          const footer = typeof content.footer === 'string' ? content.footer : undefined;
          const rawButtons = Array.isArray(content.buttons) ? content.buttons as Array<{ id: string; title: string }> : [];
          if (body && rawButtons.length) {
            await this.messages.enqueueOutboundButtons({
              workspaceId: run.workspaceId,
              whatsappAccountId: accountId,
              to: run.contact.phone,
              body,
              buttons: rawButtons,
              header,
              footer,
              contactId: run.contactId,
              inboxThreadId: sendCtx.inboxThreadId ?? null,
            });
          }
          // Park here — wait for button reply to arrive via handleIncomingMessage
          return;
        }
        case ChatbotNodeType.LIST: {
          const content = (node.content ?? {}) as JsonRecord;
          const body = typeof content.body === 'string' ? content.body : '';
          const buttonText = typeof content.buttonText === 'string' ? content.buttonText : 'View options';
          const header = typeof content.header === 'string' ? content.header : undefined;
          const footer = typeof content.footer === 'string' ? content.footer : undefined;
          const rawSections = Array.isArray(content.sections)
            ? (content.sections as Array<{ title: string; rows: Array<{ id: string; title: string; description?: string }> }>)
            : [];
          if (body && rawSections.length) {
            await this.messages.enqueueOutboundList({
              workspaceId: run.workspaceId,
              whatsappAccountId: accountId,
              to: run.contact.phone,
              body,
              buttonText,
              sections: rawSections,
              header,
              footer,
              contactId: run.contactId,
              inboxThreadId: sendCtx.inboxThreadId ?? null,
            });
          }
          // Park here — wait for list selection to arrive via handleIncomingMessage
          return;
        }
        case ChatbotNodeType.DELAY: {
          const content = (node.content ?? {}) as JsonRecord;
          const seconds = typeof content.seconds === 'number' ? content.seconds : 0;
          if (seconds > 0) {
            await new Promise<void>((r) => setTimeout(r, Math.min(seconds, 30) * 1000));
          }
          const delayNext = await this.pickNextLinear(node.id);
          if (!delayNext) { await this.completeRun(runId); return; }
          await this.prisma.chatbotRun.update({ where: { id: runId }, data: { currentNodeId: delayNext } });
          continue;
        }
        case ChatbotNodeType.END: {
          await this.completeRun(runId);
          return;
        }
        default:
          return;
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

  private async executeAction(
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
        where: {
          contactId_tagId: { contactId, tagId: tag.id },
        },
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
