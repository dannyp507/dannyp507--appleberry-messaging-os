import { Injectable, Logger } from '@nestjs/common';
import {
  AutoresponderMatchType,
  ChannelType,
  KeywordActionType,
  KeywordMatchType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TemplateRenderService } from '../messaging/template-render.service';
import { FacebookPagesService } from './facebook-pages.service';

export interface FacebookWebhookPayload {
  object: 'page' | 'instagram';
  entry: MessengerEntry[];
}

interface MessengerEntry {
  id: string; // Facebook page ID
  time: number;
  messaging?: MessengerEvent[];
}

interface MessengerEvent {
  sender: { id: string };
  recipient: { id: string };
  timestamp: number;
  message?: { mid: string; text?: string; attachments?: unknown[] };
  postback?: { payload: string; title: string };
}

@Injectable()
export class FacebookInboundService {
  private readonly logger = new Logger(FacebookInboundService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly fbPages: FacebookPagesService,
    private readonly templates: TemplateRenderService,
  ) {}

  async handleWebhook(payload: FacebookWebhookPayload): Promise<void> {
    for (const entry of payload.entry) {
      if (!entry.messaging?.length) continue;
      for (const event of entry.messaging) {
        const text = event.message?.text;
        if (!text) continue; // attachments / postbacks handled in Phase 2

        const senderId = event.sender.id;
        const pageId = entry.id;

        // Skip echo messages sent from the page itself
        if (senderId === pageId) continue;

        try {
          await this.processMessage(pageId, senderId, text, event.message?.mid);
        } catch (err) {
          this.logger.error(
            `Error processing FB message sender=${senderId} page=${pageId}: ${String(err)}`,
          );
        }
      }
    }
  }

  private async processMessage(
    pageId: string,
    senderId: string,
    text: string,
    mid?: string,
  ): Promise<void> {
    const page = await this.fbPages.findByPageId(pageId);
    if (!page) {
      this.logger.warn(`No active FacebookPage found for pageId=${pageId}`);
      return;
    }

    const workspaceId = page.workspaceId;
    const phone = `fb:${senderId}`;

    // Find or create contact
    let contact = await this.prisma.contact.findFirst({ where: { workspaceId, phone } });
    if (!contact) {
      contact = await this.prisma.contact.create({
        data: { workspaceId, phone, firstName: 'Facebook', lastName: 'User' },
      });
    }

    // Find or create inbox thread
    let thread = await this.prisma.inboxThread.findFirst({
      where: { workspaceId, facebookPageId: page.id, externalChatId: senderId },
    });
    if (!thread) {
      thread = await this.prisma.inboxThread.create({
        data: {
          workspaceId,
          contactId: contact.id,
          channel: ChannelType.MESSENGER,
          facebookPageId: page.id,
          externalChatId: senderId,
          lastMessagePreview: text.slice(0, 120),
          lastMessageAt: new Date(),
        },
      });
    } else {
      thread = await this.prisma.inboxThread.update({
        where: { id: thread.id },
        data: {
          lastMessagePreview: text.slice(0, 120),
          lastMessageAt: new Date(),
          unreadCount: { increment: 1 },
          status: 'OPEN',
        },
      });
    }

    // Idempotency guard — skip duplicate events by Messenger message ID
    if (mid) {
      const exists = await this.prisma.inboxMessage.findFirst({
        where: { threadId: thread.id, providerMessageId: mid },
      });
      if (exists) {
        this.logger.debug(`Duplicate Messenger event mid=${mid} — skipped`);
        return;
      }
    }

    await this.prisma.inboxMessage.create({
      data: {
        threadId: thread.id,
        direction: 'INBOUND',
        message: text,
        providerMessageId: mid ?? null,
      },
    });

    this.logger.log(`FB inbound: sender=${senderId} page=${pageId} text="${text.slice(0, 40)}"`);

    // ── STEP 1: Autoresponder rules (page-scoped first, then workspace-wide) ────
    const rules = await this.prisma.autoresponderRule.findMany({
      where: {
        workspaceId,
        active: true,
        // Page-scoped rules OR workspace-wide (null WA account AND null FB page)
        OR: [
          { facebookPageId: page.id },
          { facebookPageId: null, whatsappAccountId: null },
        ],
      },
      orderBy: [
        { facebookPageId: 'desc' }, // page-scoped first
        { priority: 'desc' },
        { createdAt: 'asc' },
      ],
    });

    for (const rule of rules) {
      if (!this.keywordMatches(rule.keyword, rule.matchType, text)) continue;

      const parts = rule.response
        .split(/\n---\n/)
        .map((p) => p.trim())
        .filter(Boolean);

      for (const part of parts) {
        await this.fbPages.sendMessage(page.pageAccessToken, senderId, part);
        await this.prisma.inboxMessage.create({
          data: { threadId: thread.id, direction: 'OUTBOUND', message: part },
        });
      }

      await this.prisma.inboxThread.update({
        where: { id: thread.id },
        data: { lastMessagePreview: parts.at(-1)?.slice(0, 120), lastMessageAt: new Date() },
      });

      this.logger.log(
        `Autoresponder "${rule.name ?? rule.keyword}" matched for FB page=${pageId}`,
      );
      return;
    }

    // ── STEP 2: Keyword triggers ──────────────────────────────────────────────
    // Matches triggers scoped to MESSENGER or all-channel (channel=null).
    // START_FLOW not supported in Phase 1 (chatbot engine needs channel context first).
    const triggers = await this.prisma.keywordTrigger.findMany({
      where: {
        workspaceId,
        active: true,
        OR: [{ channel: ChannelType.MESSENGER }, { channel: null }],
      },
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
    });

    for (const trigger of triggers) {
      if (!this.keywordMatches(trigger.keyword, trigger.matchType, text)) continue;

      if (trigger.actionType === KeywordActionType.SEND_TEMPLATE && trigger.targetId) {
        const template = await this.prisma.template.findFirst({
          where: { id: trigger.targetId, workspaceId },
        });
        if (!template) continue;

        const body = this.templates.interpolate(template, contact);
        await this.fbPages.sendMessage(page.pageAccessToken, senderId, body);
        await this.prisma.inboxMessage.create({
          data: { threadId: thread.id, direction: 'OUTBOUND', message: body },
        });
        this.logger.log(
          `Keyword trigger "${trigger.keyword}" → SEND_TEMPLATE for FB page=${pageId}`,
        );
        return;
      }

      if (trigger.actionType === KeywordActionType.SEND_MESSAGE && trigger.response) {
        const parts = trigger.response
          .split(/\n---\n/)
          .map((p) => p.trim())
          .filter(Boolean);
        for (const part of parts) {
          await this.fbPages.sendMessage(page.pageAccessToken, senderId, part);
          await this.prisma.inboxMessage.create({
            data: { threadId: thread.id, direction: 'OUTBOUND', message: part },
          });
        }
        this.logger.log(
          `Keyword trigger "${trigger.keyword}" → SEND_MESSAGE for FB page=${pageId}`,
        );
        return;
      }

      if (trigger.actionType === KeywordActionType.START_FLOW) {
        // Phase 2: chatbot engine needs channel context to reply via Messenger
        this.logger.warn(
          `Keyword trigger "${trigger.keyword}" → START_FLOW not yet supported for Messenger (Phase 2)`,
        );
        return;
      }
    }

    this.logger.log(`No automation match for FB message sender=${senderId} page=${pageId}`);
  }

  private keywordMatches(
    keyword: string,
    matchType: KeywordMatchType | AutoresponderMatchType | string,
    text: string,
  ): boolean {
    const k = keyword.trim().toLowerCase();
    const t = text.trim().toLowerCase();
    if (!k) return false;

    if (matchType === 'EXACT') return t === k;
    if (matchType === 'REGEX') {
      try {
        return new RegExp(k, 'i').test(t);
      } catch {
        return false;
      }
    }
    // CONTAINS: word-boundary for short keywords (≤3 chars) to avoid "1" matching "12"
    if (k.length <= 3) {
      const pattern = new RegExp(
        `(?:^|\\s)${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\s|$)`,
      );
      return pattern.test(t);
    }
    return t.includes(k);
  }
}
