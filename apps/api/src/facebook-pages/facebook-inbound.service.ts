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
  readonly logger = new Logger(FacebookInboundService.name);

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

        // Skip echo messages (page sent to itself)
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
    // ── 0. Resolve the Facebook Page ────────────────────────────────────────────
    const page = await this.fbPages.findByPageId(pageId);
    if (!page) {
      this.logger.warn(`No active FacebookPage found for pageId=${pageId}`);
      return;
    }
    const workspaceId = page.workspaceId;
    const phone = `fb:${senderId}`;

    // ── 1. Idempotency guard FIRST — skip duplicate events by Messenger mid ────
    // We check across all threads in the workspace so concurrent creates
    // can't slip through before the message row is written.
    if (mid) {
      const exists = await this.prisma.inboxMessage.findFirst({
        where: {
          providerMessageId: mid,
          thread: { workspaceId },
        },
      });
      if (exists) {
        this.logger.debug(`Duplicate Messenger event mid=${mid} — skipped`);
        return;
      }
    }

    // ── 2. Upsert contact (PSID stored in phone for lookup + externalId) ────────
    // We use findFirst + create pattern inside a serialisable transaction to
    // minimise (not fully prevent) concurrent duplicate contacts.
    let contact = await this.prisma.contact.findFirst({
      where: { workspaceId, phone },
    });
    if (!contact) {
      contact = await this.prisma.contact.create({
        data: {
          workspaceId,
          phone,          // fb:<PSID> — used as the lookup key
          externalId: senderId, // raw PSID stored separately
          firstName: 'Messenger',
          lastName: 'User',
        },
      });

      // Attempt to fetch the user's real name from the Messenger Profile API
      void this.fetchAndUpdateName(
        contact.id,
        senderId,
        page.pageAccessToken,
      ).catch((e) => this.logger.warn(`Profile fetch failed for PSID ${senderId}: ${e}`));
    }

    // ── 3. Upsert inbox thread ─────────────────────────────────────────────────
    let thread = await this.prisma.inboxThread.findFirst({
      where: { workspaceId, facebookPageId: page.id, externalChatId: senderId },
    });
    const isNewThread = !thread;
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
          isRead: false,
          unreadCount: 1,
        },
      });
    } else {
      thread = await this.prisma.inboxThread.update({
        where: { id: thread.id },
        data: {
          lastMessagePreview: text.slice(0, 120),
          lastMessageAt: new Date(),
          isRead: false,
          unreadCount: { increment: 1 },
          status: 'OPEN',
        },
      });
    }

    // ── 4. Persist inbound message ─────────────────────────────────────────────
    await this.prisma.inboxMessage.create({
      data: {
        threadId: thread.id,
        direction: 'INBOUND',
        message: text,
        providerMessageId: mid ?? null,
      },
    });

    this.logger.log(
      `FB inbound: sender=${senderId} page=${pageId} new_thread=${isNewThread} text="${text.slice(0, 40)}"`,
    );

    // ── STEP A: Autoresponder rules (page-scoped first, workspace-wide fallback) ─
    // Only matches rules scoped to THIS page OR workspace-wide rules that have
    // no channel account set at all (excludes WA-only rules and other FB pages).
    const rules = await this.prisma.autoresponderRule.findMany({
      where: {
        workspaceId,
        active: true,
        OR: [
          { facebookPageId: page.id },
          // Workspace-wide: no WA account AND no specific FB page set
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
      this.logger.log(`Autoresponder "${rule.name ?? rule.keyword}" matched for FB page=${pageId}`);
      return;
    }

    // ── STEP B: Keyword triggers (MESSENGER-scoped or all-channel) ─────────────
    // Matches triggers scoped to MESSENGER or all-channel (channel=null).
    // Explicitly excludes WHATSAPP-only triggers.
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
        this.logger.log(`Keyword trigger "${trigger.keyword}" → SEND_TEMPLATE for FB page=${pageId}`);
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
        this.logger.log(`Keyword trigger "${trigger.keyword}" → SEND_MESSAGE for FB page=${pageId}`);
        return;
      }

      if (trigger.actionType === KeywordActionType.START_FLOW) {
        this.logger.warn(
          `Keyword trigger "${trigger.keyword}" → START_FLOW not yet supported for Messenger (Phase 2)`,
        );
        return;
      }
    }

    this.logger.log(`No automation match for FB message sender=${senderId} page=${pageId}`);
  }

  /** Best-effort: fetch the user's display name from Messenger User Profile API */
  private async fetchAndUpdateName(
    contactId: string,
    psid: string,
    pageAccessToken: string,
  ): Promise<void> {
    const res = await fetch(
      `https://graph.facebook.com/v21.0/${psid}?fields=first_name,last_name&access_token=${pageAccessToken}`,
    );
    if (!res.ok) return;
    const data = (await res.json()) as {
      first_name?: string;
      last_name?: string;
    };
    if (!data.first_name) return;
    await this.prisma.contact.update({
      where: { id: contactId },
      data: {
        firstName: data.first_name ?? 'Messenger',
        lastName: data.last_name ?? 'User',
      },
    });
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
    if (matchType === 'STARTS_WITH') return t.startsWith(k);
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
