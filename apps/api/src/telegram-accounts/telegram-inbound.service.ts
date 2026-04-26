import { Injectable, Logger } from '@nestjs/common';
import {
  AutoresponderMatchType,
  ChannelType,
  ChatbotRunStatus,
  InboxMessageDirection,
  InboxThreadStatus,
  KeywordActionType,
  KeywordMatchType,
} from '@prisma/client';
import { AiService } from '../ai/ai.service';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramAccountsService } from './telegram-accounts.service';

interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from?: { id: number; first_name: string; last_name?: string; username?: string };
    chat: { id: number; type: string };
    text?: string;
    date: number;
  };
}

// Extended AutoresponderRule with fields not yet in the generated Prisma client
interface AutoresponderRuleExt {
  id: string;
  keyword: string;
  matchType: AutoresponderMatchType;
  response: string;
  mediaUrl: string | null;
  name: string | null;
  useAi: boolean;
  isDefault: boolean;
}

@Injectable()
export class TelegramInboundService {
  private readonly logger = new Logger(TelegramInboundService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly telegramSvc: TelegramAccountsService,
  ) {}

  private async sendReply(
    botToken: string,
    chatId: string,
    text: string,
    threadId: string,
  ) {
    await this.telegramSvc.sendMessage(botToken, chatId, text);
    await this.prisma.inboxMessage.create({
      data: {
        threadId,
        direction: InboxMessageDirection.OUTBOUND,
        message: text,
      },
    });
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
    if (mode === 'EXACT') return t === k;
    if (k.length <= 3) {
      const re = new RegExp(
        `(?:^|\\s)${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\s|$)`,
      );
      return re.test(t);
    }
    return t.includes(k);
  }

  private substituteVars(text: string, name: string): string {
    return text
      .replace(/\[wa_name\]/gi, name)
      .replace(/\{wa_name\}/gi, name)
      .replace(/\{\{name\}\}/gi, name);
  }

  async handleUpdate(accountId: string, update: TelegramUpdate) {
    const msg = update.message;
    if (!msg || !msg.text) return;

    const account = await this.prisma.telegramAccount.findUnique({
      where: { id: accountId },
    });
    if (!account || !account.isActive) return;

    const workspaceId = account.workspaceId;
    const chatId = String(msg.chat.id);
    const from = msg.from;
    const senderName = from?.first_name ?? 'Telegram';
    const phone = `tg:${from?.id ?? chatId}`;

    // ── Contact ──────────────────────────────────────────────────────────────
    let contact = await this.prisma.contact.findFirst({
      where: { workspaceId, phone },
    });
    if (!contact) {
      contact = await this.prisma.contact.create({
        data: {
          workspaceId,
          phone,
          firstName: senderName,
          lastName: from?.last_name ?? '',
          isValid: false,
          isDuplicate: false,
        },
      });
    }

    // ── Inbox thread ─────────────────────────────────────────────────────────
    let thread = await this.prisma.inboxThread.findFirst({
      where: { workspaceId, telegramAccountId: accountId, externalChatId: chatId },
    });
    if (!thread) {
      thread = await this.prisma.inboxThread.create({
        data: {
          workspaceId,
          contactId: contact.id,
          channel: ChannelType.TELEGRAM,
          telegramAccountId: accountId,
          externalChatId: chatId,
          status: InboxThreadStatus.OPEN,
        },
      });
    } else {
      thread = await this.prisma.inboxThread.update({
        where: { id: thread.id },
        data: { status: InboxThreadStatus.OPEN, unreadCount: { increment: 1 } },
      });
    }

    await this.prisma.inboxMessage.create({
      data: {
        threadId: thread.id,
        direction: InboxMessageDirection.INBOUND,
        message: msg.text,
        providerMessageId: String(msg.message_id),
      },
    });

    this.logger.log(`Telegram inbound from chat ${chatId} (thread ${thread.id})`);

    const reply = async (text: string) => {
      await this.sendReply(account.botToken, chatId, text, thread!.id);
    };

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 1: Autoresponder rules (workspace-wide, applies to all channels)
    // Cast to any to handle fields not in the stale Prisma client typings.
    // ─────────────────────────────────────────────────────────────────────────
    const allRules = (await (this.prisma.autoresponderRule as any).findMany({
      where: {
        workspaceId,
        active: true,
        facebookPageId: null,
        whatsappAccountId: null,
      },
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
    })) as AutoresponderRuleExt[];

    for (const r of allRules) {
      if (!this.keywordMatches(r.keyword, r.matchType, msg.text)) continue;

      await this.prisma.chatbotRun.updateMany({
        where: { workspaceId, contactId: contact.id, status: ChatbotRunStatus.ACTIVE },
        data: { status: ChatbotRunStatus.COMPLETED, currentNodeId: null },
      });

      if (r.useAi) {
        const recent = await this.prisma.inboxMessage.findMany({
          where: { threadId: thread.id },
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: { direction: true, message: true },
        });
        const aiReply = await this.ai.generateReply(
          { workspaceId, contactId: contact.id, threadId: thread.id, recentMessages: recent.reverse() },
          msg.text,
          r.response?.trim() || undefined,
        );
        await reply(aiReply ?? "I'm sorry, I couldn't process that right now.");
      } else {
        const parts = r.response
          .split(/\n---\n/)
          .map((p) => this.substituteVars(p.trim(), senderName))
          .filter(Boolean);
        for (const part of parts) await reply(part);
      }
      this.logger.log(`Autoresponder rule "${r.name ?? r.keyword}" matched for Telegram chat ${chatId}`);
      return;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 2: Keyword triggers — SEND_MESSAGE replies
    // ─────────────────────────────────────────────────────────────────────────
    const triggers = (await (this.prisma.keywordTrigger as any).findMany({
      where: {
        workspaceId,
        active: true,
        OR: [{ channel: null }, { channel: ChannelType.TELEGRAM }],
      },
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
    })) as Array<{ id: string; keyword: string; matchType: KeywordMatchType; actionType: KeywordActionType; response: string | null; targetId: string | null }>;

    for (const t of triggers) {
      if (!this.keywordMatches(t.keyword, t.matchType, msg.text)) continue;

      const actionType = t.actionType as unknown as string;
      if ((actionType === KeywordActionType.SEND_MESSAGE || actionType === 'SEND_REPLY') && t.response) {
        await reply(this.substituteVars(t.response, senderName));
        return;
      }
      if (actionType === KeywordActionType.START_FLOW) {
        this.logger.warn(`Keyword trigger "${t.keyword}" START_FLOW — chatbot flows not yet supported on Telegram`);
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 3: Default rule or AI fallback
    // ─────────────────────────────────────────────────────────────────────────
    const defaultRule = (await (this.prisma.autoresponderRule as any).findFirst({
      where: {
        workspaceId,
        active: true,
        isDefault: true,
        facebookPageId: null,
        whatsappAccountId: null,
      },
      orderBy: [{ priority: 'desc' }],
    })) as AutoresponderRuleExt | null;

    const recent = await this.prisma.inboxMessage.findMany({
      where: { threadId: thread.id },
      orderBy: { createdAt: 'desc' },
      take: 16,
      select: { direction: true, message: true },
    });

    if (defaultRule) {
      if (defaultRule.useAi) {
        const aiReply = await this.ai.generateReply(
          { workspaceId, contactId: contact.id, threadId: thread.id, recentMessages: recent.reverse() },
          msg.text,
          defaultRule.response?.trim() || undefined,
        );
        await reply(aiReply ?? "I'm sorry, I couldn't process that right now.");
      } else {
        const parts = defaultRule.response
          .split(/\n---\n/)
          .map((p) => this.substituteVars(p.trim(), senderName))
          .filter(Boolean);
        for (const part of parts) await reply(part);
      }
      return;
    }

    // Bare AI fallback
    const aiReply = await this.ai.generateReply(
      { workspaceId, contactId: contact.id, threadId: thread.id, recentMessages: recent.reverse() },
      msg.text,
    );
    if (aiReply?.trim()) {
      await reply(aiReply.trim());
    }
  }
}
