import { Injectable, Logger } from '@nestjs/common';
import {
  AutoresponderMatchType,
  ChannelType,
  KeywordActionType,
  KeywordMatchType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TemplateRenderService } from '../messaging/template-render.service';
import { InstagramAccountsService } from './instagram-accounts.service';
import { AiService } from '../ai/ai.service';

export interface InstagramWebhookPayload {
  object: 'instagram';
  entry: IgWebhookEntry[];
}

interface IgWebhookEntry {
  id: string; // Instagram-scoped user ID or page ID
  time: number;
  messaging?: IgMessagingEvent[];
  changes?: IgChange[];
}

interface IgMessagingEvent {
  sender: { id: string };
  recipient: { id: string };
  timestamp: number;
  message?: { mid: string; text?: string; attachments?: unknown[] };
}

interface IgChange {
  field: string;
  value: unknown;
}

@Injectable()
export class InstagramInboundService {
  readonly logger = new Logger(InstagramInboundService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly igAccounts: InstagramAccountsService,
    private readonly templates: TemplateRenderService,
    private readonly ai: AiService,
  ) {}

  async handleWebhook(payload: InstagramWebhookPayload): Promise<void> {
    for (const entry of payload.entry) {
      const igUserId = entry.id;

      if (entry.messaging?.length) {
        for (const event of entry.messaging) {
          const text = event.message?.text;
          if (!text) continue;

          const senderId = event.sender.id;

          // Skip echo messages (account sending to itself)
          if (senderId === igUserId) continue;

          try {
            await this.processMessage(igUserId, senderId, text, event.message?.mid);
          } catch (err) {
            this.logger.error(
              `Error processing IG message sender=${senderId} igUserId=${igUserId}: ${String(err)}`,
            );
          }
        }
      }
    }
  }

  private async processMessage(
    igUserId: string,
    senderId: string,
    text: string,
    mid?: string,
  ): Promise<void> {
    // ── 0. Resolve the Instagram Account ─────────────────────────────────────
    const account = await this.igAccounts.findByIgUserId(igUserId);
    if (!account) {
      this.logger.warn(`No active InstagramAccount found for igUserId=${igUserId}`);
      return;
    }
    const workspaceId = account.workspaceId;
    const phone = `ig:${senderId}`;

    // ── 1. Idempotency guard — skip duplicate events by message mid ───────────
    if (mid) {
      const exists = await this.prisma.inboxMessage.findFirst({
        where: {
          providerMessageId: mid,
          thread: { workspaceId },
        },
      });
      if (exists) {
        this.logger.debug(`Duplicate IG event mid=${mid} — skipped`);
        return;
      }
    }

    // ── 2. Upsert contact (IGSID stored in phone for lookup + externalId) ────
    const contact = await this.prisma.contact.upsert({
      where: { workspaceId_phone: { workspaceId, phone } },
      update: {
        externalId: senderId,
      },
      create: {
        workspaceId,
        phone,
        externalId: senderId,
        firstName: 'Instagram',
        lastName: 'User',
      },
    });

    // Attempt to update name (best-effort; IG API has limited profile data)
    if (contact.firstName === 'Instagram' && contact.lastName === 'User') {
      void this.fetchAndUpdateName(contact.id, senderId).catch((e) =>
        this.logger.warn(`Profile fetch failed for IGSID ${senderId}: ${e}`),
      );
    }

    // ── 3. Upsert inbox thread ─────────────────────────────────────────────────
    let thread = await this.prisma.inboxThread.findFirst({
      where: { workspaceId, instagramAccountId: account.id, externalChatId: senderId },
    });
    const isNewThread = !thread;
    if (!thread) {
      thread = await this.prisma.inboxThread.create({
        data: {
          workspaceId,
          contactId: contact.id,
          channel: ChannelType.INSTAGRAM,
          instagramAccountId: account.id,
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
      `IG inbound: sender=${senderId} igUserId=${igUserId} new_thread=${isNewThread} text="${text.slice(0, 40)}"`,
    );

    // ── Load DM bot settings once ──────────────────────────────────────────────
    const dmSettings = await this.prisma.instagramAccountAiSettings.findUnique({
      where: { instagramAccountId: account.id },
    });

    // ── Human takeover keywords ────────────────────────────────────────────────
    const msgLower = text.trim().toLowerCase();

    if (
      dmSettings?.aiOffKeyword?.trim() &&
      msgLower === dmSettings.aiOffKeyword.trim().toLowerCase()
    ) {
      await this.prisma.inboxThread.update({
        where: { id: thread.id },
        data: { aiPaused: true },
      });
      if (dmSettings.aiOffReply?.trim()) {
        await this.maybeTyping(dmSettings, account.pageAccessToken, account.igUserId, senderId, 800);
        await this.igAccounts.sendMessage(
          account.igUserId,
          account.pageAccessToken,
          senderId,
          dmSettings.aiOffReply,
        );
        await this.prisma.inboxMessage.create({
          data: { threadId: thread.id, direction: 'OUTBOUND', message: dmSettings.aiOffReply },
        });
      }
      this.logger.log(`AI paused (human takeover) for thread=${thread.id}`);
      return;
    }

    if (
      dmSettings?.aiOnKeyword?.trim() &&
      msgLower === dmSettings.aiOnKeyword.trim().toLowerCase()
    ) {
      await this.prisma.inboxThread.update({
        where: { id: thread.id },
        data: { aiPaused: false },
      });
      if (dmSettings.aiOnReply?.trim()) {
        await this.maybeTyping(dmSettings, account.pageAccessToken, account.igUserId, senderId, 800);
        await this.igAccounts.sendMessage(
          account.igUserId,
          account.pageAccessToken,
          senderId,
          dmSettings.aiOnReply,
        );
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

    // ── Welcome message — sent on the very first DM ────────────────────────────
    if (isNewThread && dmSettings?.dmWelcomeEnabled && dmSettings.dmWelcomeText?.trim()) {
      await this.maybeTyping(dmSettings, account.pageAccessToken, account.igUserId, senderId, 1200);
      await this.igAccounts.sendMessage(
        account.igUserId,
        account.pageAccessToken,
        senderId,
        dmSettings.dmWelcomeText,
      );
      await this.prisma.inboxMessage.create({
        data: { threadId: thread.id, direction: 'OUTBOUND', message: dmSettings.dmWelcomeText },
      });
      await this.prisma.inboxThread.update({
        where: { id: thread.id },
        data: {
          lastMessagePreview: dmSettings.dmWelcomeText.slice(0, 120),
          lastMessageAt: new Date(),
        },
      });
      this.logger.log(`Welcome message sent to new IG thread sender=${senderId}`);
    }

    // ── STEP A: Autoresponder rules ──────────────────────────────────────────
    const rules = await this.prisma.autoresponderRule.findMany({
      where: {
        workspaceId,
        active: true,
        OR: [
          { instagramAccountId: account.id },
          // Workspace-wide: no WA, no FB page, no IG account set
          { instagramAccountId: null, facebookPageId: null, whatsappAccountId: null },
        ],
      },
      orderBy: [
        { instagramAccountId: 'desc' }, // account-scoped first
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

      await this.maybeTyping(dmSettings, account.pageAccessToken, account.igUserId, senderId, 1200);
      for (const part of parts) {
        await this.igAccounts.sendMessage(account.igUserId, account.pageAccessToken, senderId, part);
        await this.prisma.inboxMessage.create({
          data: { threadId: thread.id, direction: 'OUTBOUND', message: part },
        });
      }
      await this.prisma.inboxThread.update({
        where: { id: thread.id },
        data: { lastMessagePreview: parts.at(-1)?.slice(0, 120), lastMessageAt: new Date() },
      });
      this.logger.log(
        `Autoresponder "${rule.name ?? rule.keyword}" matched for IG igUserId=${igUserId}`,
      );
      return;
    }

    // ── STEP B: Keyword triggers (INSTAGRAM-scoped or all-channel) ─────────────
    const triggers = await this.prisma.keywordTrigger.findMany({
      where: {
        workspaceId,
        active: true,
        OR: [{ channel: ChannelType.INSTAGRAM }, { channel: null }],
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
        await this.maybeTyping(dmSettings, account.pageAccessToken, account.igUserId, senderId, 1200);
        await this.igAccounts.sendMessage(account.igUserId, account.pageAccessToken, senderId, body);
        await this.prisma.inboxMessage.create({
          data: { threadId: thread.id, direction: 'OUTBOUND', message: body },
        });
        this.logger.log(
          `Keyword trigger "${trigger.keyword}" → SEND_TEMPLATE for IG igUserId=${igUserId}`,
        );
        return;
      }

      if (trigger.actionType === KeywordActionType.SEND_MESSAGE && trigger.response) {
        const parts = trigger.response
          .split(/\n---\n/)
          .map((p) => p.trim())
          .filter(Boolean);
        await this.maybeTyping(dmSettings, account.pageAccessToken, account.igUserId, senderId, 1200);
        for (const part of parts) {
          await this.igAccounts.sendMessage(
            account.igUserId,
            account.pageAccessToken,
            senderId,
            part,
          );
          await this.prisma.inboxMessage.create({
            data: { threadId: thread.id, direction: 'OUTBOUND', message: part },
          });
        }
        this.logger.log(
          `Keyword trigger "${trigger.keyword}" → SEND_MESSAGE for IG igUserId=${igUserId}`,
        );
        return;
      }

      if (trigger.actionType === KeywordActionType.START_FLOW) {
        this.logger.warn(
          `Keyword trigger "${trigger.keyword}" → START_FLOW not yet supported for Instagram (Phase 2)`,
        );
        return;
      }
    }

    // ── STEP C: AI fallback / default reply ───────────────────────────────────
    if (dmSettings?.dmAiEnabled) {
      await this.maybeTyping(dmSettings, account.pageAccessToken, account.igUserId, senderId, 0);

      // Load the most recent 20 messages for conversation context.
      // Fetch newest-first then reverse so history is chronological for the AI.
      const recentRows = await this.prisma.inboxMessage.findMany({
        where: { threadId: thread.id },
        orderBy: { createdAt: 'desc' },
        take: 20,
      });

      const recentMessages = recentRows.reverse().map((m) => ({
        direction: m.direction,
        message: m.message,
      }));

      const aiReply = await this.ai.generateReply(
        {
          workspaceId,
          contactId: contact.id,
          threadId: thread.id,
          recentMessages,
          instagramAccountId: account.id,
        },
        text,
      );

      if (aiReply) {
        await this.igAccounts.sendMessage(
          account.igUserId,
          account.pageAccessToken,
          senderId,
          aiReply,
        );
        await this.prisma.inboxMessage.create({
          data: { threadId: thread.id, direction: 'OUTBOUND', message: aiReply },
        });
        await this.prisma.inboxThread.update({
          where: { id: thread.id },
          data: { lastMessagePreview: aiReply.slice(0, 120), lastMessageAt: new Date() },
        });
        this.logger.log(`AI DM reply sent to sender=${senderId} igUserId=${igUserId}`);
        return;
      }

      this.logger.warn(`AI enabled but returned no reply for sender=${senderId} igUserId=${igUserId}`);
    }

    // No AI or AI failed — use static default reply if configured
    if (dmSettings?.dmDefaultReply?.trim()) {
      await this.maybeTyping(dmSettings, account.pageAccessToken, account.igUserId, senderId, 1200);
      await this.igAccounts.sendMessage(
        account.igUserId,
        account.pageAccessToken,
        senderId,
        dmSettings.dmDefaultReply,
      );
      await this.prisma.inboxMessage.create({
        data: { threadId: thread.id, direction: 'OUTBOUND', message: dmSettings.dmDefaultReply },
      });
      await this.prisma.inboxThread.update({
        where: { id: thread.id },
        data: {
          lastMessagePreview: dmSettings.dmDefaultReply.slice(0, 120),
          lastMessageAt: new Date(),
        },
      });
      this.logger.log(`Default DM reply sent to sender=${senderId} igUserId=${igUserId}`);
      return;
    }

    this.logger.log(`No automation match for IG DM sender=${senderId} igUserId=${igUserId}`);
  }

  /**
   * If typing indicator is enabled, sends `typing_on` to the IG Messaging API
   * and optionally waits `delayMs` milliseconds.
   * Never throws — a failed typing call must never block the actual reply.
   */
  private async maybeTyping(
    dmSettings: { dmTypingEnabled?: boolean } | null | undefined,
    pageAccessToken: string,
    igUserId: string,
    recipientId: string,
    delayMs: number,
  ): Promise<void> {
    if (!dmSettings?.dmTypingEnabled) return;
    try {
      await fetch(`https://graph.facebook.com/v21.0/${igUserId}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${pageAccessToken}`,
        },
        body: JSON.stringify({
          recipient: { id: recipientId },
          sender_action: 'typing_on',
        }),
      });
    } catch (e) {
      this.logger.warn(`[TypingIndicator] Failed to send typing_on: ${String(e)}`);
    }
    if (delayMs > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
    }
  }

  /**
   * Best-effort: Instagram doesn't expose as much profile data via the API.
   * Use a placeholder name based on the IGSID.
   */
  private async fetchAndUpdateName(contactId: string, igsid: string): Promise<void> {
    // Instagram's Messaging API doesn't provide user profile names in the same
    // way as Messenger. Use the IGSID as a placeholder identifier.
    await this.prisma.contact.update({
      where: { id: contactId },
      data: {
        firstName: `ig:${igsid}`,
        lastName: '',
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
    // CONTAINS: word-boundary for short keywords (≤3 chars)
    if (k.length <= 3) {
      const pattern = new RegExp(
        `(?:^|\\s)${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\s|$)`,
      );
      return pattern.test(t);
    }
    return t.includes(k);
  }
}
