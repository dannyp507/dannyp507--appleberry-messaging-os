import { Injectable, Logger } from '@nestjs/common';
import {
  AutoresponderMatchType,
  ChatbotFlowStatus,
  ChatbotRunStatus,
  InboxMessageDirection,
  InboxThreadStatus,
  KeywordActionType,
  KeywordMatchType,
} from '@prisma/client';
import { AiService } from '../ai/ai.service';
import { ChatbotEngineService } from '../chatbot/chatbot-engine.service';
import { TemplateRenderService } from '../messaging/template-render.service';
import { MessagesService } from '../messages/messages.service';
import { PrismaService } from '../prisma/prisma.service';
import type { IncomingMessageJob } from '../queue/queue.constants';
import { normalizePhoneE164 } from '../contacts/phone.util';

@Injectable()
export class IncomingMessageService {
  private readonly logger = new Logger(IncomingMessageService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly chatbot: ChatbotEngineService,
    private readonly templates: TemplateRenderService,
    private readonly messages: MessagesService,
    private readonly ai: AiService,
  ) {}

  /** Replace Planify X / common template variables in a response string */
  private substituteVars(text: string, name: string): string {
    return text
      .replace(/\[wa_name\]/gi, name)
      .replace(/\{wa_name\}/gi, name)
      .replace(/\{\{name\}\}/gi, name);
  }

  async dispatch(job: IncomingMessageJob): Promise<void> {
    const account = await this.prisma.whatsAppAccount.findUnique({
      where: { id: job.whatsappAccountId },
    });
    if (!account) {
      this.logger.warn(`Unknown WhatsApp account ${job.whatsappAccountId}`);
      return;
    }

    const workspaceId = account.workspaceId;

    // For @lid JIDs the `from` is the full JID — use it as the phone identifier
    // For regular phone JIDs, normalise to E164
    const rawFrom = job.from ?? '';
    const isJid = rawFrom.includes('@');
    const { e164, isValid } = isJid
      ? { e164: rawFrom, isValid: false }
      : normalizePhoneE164(rawFrom, 'ZA');

    // Prefer sender's WhatsApp push name; fall back to phone/JID digits
    const senderName =
      job.senderName?.trim() ||
      (isJid ? rawFrom.replace(/@.*/, '') : e164.replace(/\D/g, ''));

    // Use remoteJid for replies so @lid accounts are reached correctly
    const replyTo = job.remoteJid ?? e164;

    let contact = await this.prisma.contact.findFirst({
      where: { workspaceId, phone: e164 },
    });
    if (!contact) {
      contact = await this.prisma.contact.create({
        data: {
          workspaceId,
          firstName: senderName || 'Unknown',
          lastName: '',
          phone: e164,
          isValid,
          isDuplicate: false,
        },
      });
    } else if (contact.firstName === 'Unknown' && senderName) {
      // Update name from push name if we have a better one now
      await this.prisma.contact.update({
        where: { id: contact.id },
        data: { firstName: senderName },
      });
    }

    let thread = await this.prisma.inboxThread.findFirst({
      where: { workspaceId, contactId: contact.id, whatsappAccountId: account.id },
    });
    if (!thread) {
      thread = await this.prisma.inboxThread.create({
        data: {
          workspaceId,
          contactId: contact.id,
          whatsappAccountId: account.id,
          status: InboxThreadStatus.OPEN,
        },
      });
    } else {
      thread = await this.prisma.inboxThread.update({
        where: { id: thread.id },
        data: { status: InboxThreadStatus.OPEN },
      });
    }

    await this.prisma.inboxMessage.create({
      data: {
        threadId: thread.id,
        direction: InboxMessageDirection.INBOUND,
        message: job.text,
      },
    });

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 1: Autoresponder rules (chatbot items) — checked FIRST so that
    // keyword triggers (e.g. "1", "2", menu options) always fire regardless of
    // whether the contact is currently inside a chatbot flow.  If a rule
    // matches we also cancel any stuck ACTIVE run so the flow doesn't interfere.
    //
    // Account-scoped rules are checked first; workspace-wide rules (null account)
    // serve as a fallback.
    // ─────────────────────────────────────────────────────────────────────────
    const allRules = await this.prisma.autoresponderRule.findMany({
      where: {
        workspaceId,
        active: true,
        OR: [
          { whatsappAccountId: account.id },
          { whatsappAccountId: null },
        ],
      },
      orderBy: [
        // Account-scoped rules have priority over workspace-wide ones
        { whatsappAccountId: 'desc' },
        { priority: 'desc' },
        { createdAt: 'asc' },
      ],
    });

    for (const r of allRules) {
      if (!this.keywordMatches(r.keyword, r.matchType, job.text)) {
        continue;
      }
      // Cancel any active chatbot run so keywords always interrupt flows
      await this.prisma.chatbotRun.updateMany({
        where: {
          workspaceId,
          contactId: contact.id,
          status: ChatbotRunStatus.ACTIVE,
        },
        data: { status: ChatbotRunStatus.COMPLETED, currentNodeId: null },
      });

      if (r.mediaUrl) {
        // Media rule: send a single media message — response text becomes caption
        const caption = this.substituteVars(r.response?.trim() ?? '', senderName);
        await this.messages.enqueueOutboundText({
          workspaceId,
          whatsappAccountId: account.id,
          to: replyTo,
          message: caption,
          contactId: contact.id,
          inboxThreadId: thread.id,
          mediaUrl: r.mediaUrl,
        });
        this.logger.log(`Autoresponder rule "${r.name ?? r.keyword}" matched (media) for account ${account.id}`);
      } else {
        // Text-only rule: split on '\n---\n' for multi-bubble messages
        const parts = r.response
          .split(/\n---\n/)
          .map((p) => this.substituteVars(p.trim(), senderName))
          .filter(Boolean);

        for (const part of parts) {
          await this.messages.enqueueOutboundText({
            workspaceId,
            whatsappAccountId: account.id,
            to: replyTo,
            message: part,
            contactId: contact.id,
            inboxThreadId: thread.id,
          });
        }
        this.logger.log(`Autoresponder rule "${r.name ?? r.keyword}" matched (${parts.length} message${parts.length > 1 ? 's' : ''}) for account ${account.id}`);
      }
      return;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 2: Active chatbot flow (QUESTION node waiting for user input)
    // ─────────────────────────────────────────────────────────────────────────
    const ctx = {
      workspaceId,
      whatsappAccountId: account.id,
      contactId: contact.id,
      text: job.text,
      inboxThreadId: thread.id,
    };

    const continued = await this.chatbot.handleIncomingMessage(ctx);
    if (continued) {
      return;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 3: Keyword triggers (START_FLOW / SEND_TEMPLATE)
    // ─────────────────────────────────────────────────────────────────────────
    const triggers = await this.prisma.keywordTrigger.findMany({
      where: { workspaceId, active: true },
      orderBy: { createdAt: 'asc' },
    });
    for (const t of triggers) {
      if (!this.keywordMatches(t.keyword, t.matchType, job.text)) {
        continue;
      }
      if (t.actionType === KeywordActionType.START_FLOW) {
        await this.chatbot.startFlow({
          workspaceId,
          whatsappAccountId: account.id,
          contactId: contact.id,
          flowId: t.targetId,
          inboxThreadId: thread.id,
        });
        return;
      }
      if (t.actionType === KeywordActionType.SEND_TEMPLATE) {
        const template = await this.prisma.template.findFirst({
          where: { id: t.targetId, workspaceId },
        });
        if (!template) continue;
        const body = this.substituteVars(this.templates.interpolate(template, contact), senderName);
        await this.messages.enqueueOutboundText({
          workspaceId,
          whatsappAccountId: account.id,
          to: replyTo,
          message: body,
          contactId: contact.id,
          inboxThreadId: thread.id,
        });
        return;
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 4: AI fallback
    // ─────────────────────────────────────────────────────────────────────────
    const recent = await this.prisma.inboxMessage.findMany({
      where: { threadId: thread.id },
      orderBy: { createdAt: 'desc' },
      take: 16,
      select: { direction: true, message: true },
    });

    const reply = await this.ai.generateReply(
      {
        workspaceId,
        contactId: contact.id,
        threadId: thread.id,
        recentMessages: recent.reverse(),
      },
      job.text,
    );

    if (reply?.trim()) {
      await this.messages.enqueueOutboundText({
        workspaceId,
        whatsappAccountId: account.id,
        to: replyTo,
        message: reply.trim(),
        contactId: contact.id,
        inboxThreadId: thread.id,
      });
    }
  }

  private keywordMatches(
    keyword: string,
    matchType: KeywordMatchType | AutoresponderMatchType,
    text: string,
  ): boolean {
    const k = keyword.trim().toLowerCase();
    const t = text.trim().toLowerCase();
    if (!k) return false;
    const mode = matchType as string;
    if (mode === KeywordMatchType.EXACT || mode === AutoresponderMatchType.EXACT) {
      return t === k;
    }
    // CONTAINS: for short keywords (≤3 chars like "1","2","hi") use word-boundary
    // matching to prevent "1" from matching inside "12" or "21"
    if (k.length <= 3) {
      const wordBoundary = new RegExp(`(?:^|\\s)${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\s|$)`);
      return wordBoundary.test(t);
    }
    return t.includes(k);
  }
}
