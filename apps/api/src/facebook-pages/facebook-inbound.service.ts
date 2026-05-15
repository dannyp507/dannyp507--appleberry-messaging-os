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
import { FbCommentProcessorService } from '../fb-comment-automations/fb-comment-processor.service';
import { AiService } from '../ai/ai.service';

export interface FacebookWebhookPayload {
  object: 'page' | 'instagram';
  entry: WebhookEntry[];
}

interface WebhookEntry {
  id: string; // Facebook page ID
  time: number;
  /** Messenger events (DMs, postbacks, delivery receipts) */
  messaging?: MessengerEvent[];
  /** Page feed events (comments, likes, posts) */
  changes?: FeedChange[];
}

interface MessengerEvent {
  sender: { id: string };
  recipient: { id: string };
  timestamp: number;
  message?: { mid: string; text?: string; attachments?: unknown[] };
  postback?: { payload: string; title: string };
}

interface FeedChange {
  field: string;
  value: {
    item?: string;        // 'comment' | 'post' | 'like' | 'share' | 'reaction'
    verb?: string;        // 'add' | 'remove' | 'edit'
    comment_id?: string;
    post_id?: string;
    parent_id?: string;   // parent comment / post ID
    from?: { id: string; name?: string };
    message?: string;
    created_time?: number;
  };
}

@Injectable()
export class FacebookInboundService {
  readonly logger = new Logger(FacebookInboundService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly fbPages: FacebookPagesService,
    private readonly templates: TemplateRenderService,
    private readonly commentProcessor: FbCommentProcessorService,
    private readonly ai: AiService,
  ) {}

  async handleWebhook(payload: FacebookWebhookPayload): Promise<void> {
    for (const entry of payload.entry) {
      const pageId = entry.id;

      // ── Messenger DM events ────────────────────────────────────────────────
      if (entry.messaging?.length) {
        for (const event of entry.messaging) {
          const text = event.message?.text;
          if (!text) continue; // attachments / postbacks handled later

          const senderId = event.sender.id;

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

      // ── Feed change events (post comments, likes, etc.) ────────────────────
      if (entry.changes?.length) {
        for (const change of entry.changes) {
          if (change.field !== 'feed') continue;
          const v = change.value;

          // Only process new comments (not edits/deletes, not likes/shares)
          if (v.item !== 'comment' || v.verb !== 'add') continue;
          if (!v.comment_id || !v.post_id || !v.from?.id || !v.message) continue;

          try {
            await this.commentProcessor.processComment({
              pageId,
              commentId: v.comment_id,
              postId: v.post_id,
              commenterId: v.from.id,
              commenterName: v.from.name,
              commentText: v.message,
              parentId: v.parent_id,
            });
          } catch (err) {
            this.logger.error(
              `Error processing FB comment commentId=${v.comment_id} page=${pageId}: ${String(err)}`,
            );
          }
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
    // Uses the DB-level unique constraint on (workspaceId, phone) to atomically
    // prevent duplicate contacts even under concurrent webhook events.
    const contact = await this.prisma.contact.upsert({
      where: { workspaceId_phone: { workspaceId, phone } },
      update: {
        // Ensure externalId is always set even on existing contacts
        externalId: senderId,
      },
      create: {
        workspaceId,
        phone,          // fb:<PSID> — used as the lookup key
        externalId: senderId, // raw PSID stored separately
        firstName: 'Messenger',
        lastName: 'User',
      },
    });

    // Fetch real name if the contact still has the default placeholder name
    if (contact.firstName === 'Messenger' && contact.lastName === 'User') {
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

    // ── Load DM bot settings once (used in welcome + AI fallback) ─────────────
    const dmSettings = await this.prisma.facebookPageAiSettings.findUnique({
      where: { facebookPageId: page.id },
    });

    // ── Human takeover keywords (checked before all other automation) ─────────
    // These always take priority — no other response is sent on the same message.
    const msgLower = text.trim().toLowerCase();

    if (dmSettings?.aiOffKeyword?.trim() && msgLower === dmSettings.aiOffKeyword.trim().toLowerCase()) {
      await this.prisma.inboxThread.update({ where: { id: thread.id }, data: { aiPaused: true } });
      if (dmSettings.aiOffReply?.trim()) {
        await this.maybeTyping(dmSettings, page.pageAccessToken, senderId, 800);
        await this.fbPages.sendMessage(page.pageAccessToken, senderId, dmSettings.aiOffReply);
        await this.prisma.inboxMessage.create({
          data: { threadId: thread.id, direction: 'OUTBOUND', message: dmSettings.aiOffReply },
        });
      }
      this.logger.log(`AI paused (human takeover) for thread=${thread.id}`);
      return;
    }

    if (dmSettings?.aiOnKeyword?.trim() && msgLower === dmSettings.aiOnKeyword.trim().toLowerCase()) {
      await this.prisma.inboxThread.update({ where: { id: thread.id }, data: { aiPaused: false } });
      if (dmSettings.aiOnReply?.trim()) {
        await this.maybeTyping(dmSettings, page.pageAccessToken, senderId, 800);
        await this.fbPages.sendMessage(page.pageAccessToken, senderId, dmSettings.aiOnReply);
        await this.prisma.inboxMessage.create({
          data: { threadId: thread.id, direction: 'OUTBOUND', message: dmSettings.aiOnReply },
        });
      }
      this.logger.log(`AI resumed for thread=${thread.id}`);
      return;
    }

    // If a human agent has taken over this thread, skip all bot automation
    const aiPaused = (thread as { aiPaused?: boolean }).aiPaused ?? false;
    if (aiPaused) {
      this.logger.log(`AI paused — skipping automation for thread=${thread.id}`);
      return;
    }

    // ── Welcome message — sent on the very first DM to this page ─────────────
    if (isNewThread && dmSettings?.dmWelcomeEnabled && dmSettings.dmWelcomeText?.trim()) {
      await this.maybeTyping(dmSettings, page.pageAccessToken, senderId, 1200);
      await this.fbPages.sendMessage(page.pageAccessToken, senderId, dmSettings.dmWelcomeText);
      await this.prisma.inboxMessage.create({
        data: { threadId: thread.id, direction: 'OUTBOUND', message: dmSettings.dmWelcomeText },
      });
      await this.prisma.inboxThread.update({
        where: { id: thread.id },
        data: { lastMessagePreview: dmSettings.dmWelcomeText.slice(0, 120), lastMessageAt: new Date() },
      });
      this.logger.log(`Welcome message sent to new thread sender=${senderId}`);
      // Continue processing — welcome is sent in addition to the normal reply
    }

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

      await this.maybeTyping(dmSettings, page.pageAccessToken, senderId, 1200);
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
        await this.maybeTyping(dmSettings, page.pageAccessToken, senderId, 1200);
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
        await this.maybeTyping(dmSettings, page.pageAccessToken, senderId, 1200);
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

    // ── STEP C: AI fallback / default reply ───────────────────────────────────
    if (dmSettings?.dmAiEnabled) {
      // Show typing indicator before calling AI (AI processing itself acts as the delay)
      await this.maybeTyping(dmSettings, page.pageAccessToken, senderId, 0);

      // Load recent messages for conversation context (up to 10 turns = 20 rows)
      const recentRows = await this.prisma.inboxMessage.findMany({
        where: { threadId: thread.id },
        orderBy: { createdAt: 'asc' },
        take: 20,
      });

      const recentMessages = recentRows.map((m) => ({
        direction: m.direction,
        message: m.message,
      }));

      const aiReply = await this.ai.generateReply(
        {
          workspaceId,
          contactId: contact.id,
          threadId: thread.id,
          recentMessages,
          facebookPageId: page.id,
        },
        text,
      );

      if (aiReply) {
        await this.fbPages.sendMessage(page.pageAccessToken, senderId, aiReply);
        await this.prisma.inboxMessage.create({
          data: { threadId: thread.id, direction: 'OUTBOUND', message: aiReply },
        });
        await this.prisma.inboxThread.update({
          where: { id: thread.id },
          data: { lastMessagePreview: aiReply.slice(0, 120), lastMessageAt: new Date() },
        });
        this.logger.log(`AI DM reply sent to sender=${senderId} page=${pageId}`);
        return;
      }

      this.logger.warn(`AI enabled but returned no reply for sender=${senderId} page=${pageId}`);
    }

    // No AI or AI failed — use static default reply if configured
    if (dmSettings?.dmDefaultReply?.trim()) {
      await this.maybeTyping(dmSettings, page.pageAccessToken, senderId, 1200);
      await this.fbPages.sendMessage(page.pageAccessToken, senderId, dmSettings.dmDefaultReply);
      await this.prisma.inboxMessage.create({
        data: { threadId: thread.id, direction: 'OUTBOUND', message: dmSettings.dmDefaultReply },
      });
      await this.prisma.inboxThread.update({
        where: { id: thread.id },
        data: { lastMessagePreview: dmSettings.dmDefaultReply.slice(0, 120), lastMessageAt: new Date() },
      });
      this.logger.log(`Default DM reply sent to sender=${senderId} page=${pageId}`);
      return;
    }

    this.logger.log(`No automation match for FB DM sender=${senderId} page=${pageId}`);
  }

  /**
   * If typing indicator is enabled, sends `typing_on` to Messenger and optionally
   * waits `delayMs` milliseconds so the bubble is visible before the reply arrives.
   * For AI replies pass delayMs=0 — the AI call itself provides the natural delay.
   * Never throws — a failed typing call must never block the actual reply.
   */
  private async maybeTyping(
    dmSettings: { dmTypingEnabled?: boolean } | null | undefined,
    pageAccessToken: string,
    recipientId: string,
    delayMs: number,
  ): Promise<void> {
    if (!dmSettings?.dmTypingEnabled) return;
    try {
      await fetch(
        `https://graph.facebook.com/v21.0/me/messages?access_token=${pageAccessToken}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            recipient: { id: recipientId },
            sender_action: 'typing_on',
          }),
        },
      );
    } catch (e) {
      this.logger.warn(`[TypingIndicator] Failed to send typing_on: ${String(e)}`);
    }
    if (delayMs > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
    }
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
