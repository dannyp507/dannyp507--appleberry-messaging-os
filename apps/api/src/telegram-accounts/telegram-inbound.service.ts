import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

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

@Injectable()
export class TelegramInboundService {
  private readonly logger = new Logger(TelegramInboundService.name);

  constructor(private readonly prisma: PrismaService) {}

  async handleUpdate(accountId: string, update: TelegramUpdate) {
    const msg = update.message;
    if (!msg || !msg.text) return;

    const account = await this.prisma.telegramAccount.findUnique({
      where: { id: accountId },
    });
    if (!account || !account.isActive) return;

    const chatId = String(msg.chat.id);
    const from = msg.from;

    // Upsert contact by phone/externalId (use Telegram user id as identifier)
    const phone = `tg:${from?.id ?? chatId}`;
    const contact = await this.prisma.contact.upsert({
      where: { workspaceId_phone: { workspaceId: account.workspaceId, phone } },
      create: {
        workspaceId: account.workspaceId,
        phone,
        firstName: from?.first_name ?? 'Telegram',
        lastName: from?.last_name ?? '',
      },
      update: {},
    });

    // Upsert inbox thread
    let thread = await this.prisma.inboxThread.findFirst({
      where: {
        workspaceId: account.workspaceId,
        telegramAccountId: accountId,
        externalChatId: chatId,
      },
    });

    if (!thread) {
      thread = await this.prisma.inboxThread.create({
        data: {
          workspaceId: account.workspaceId,
          contactId: contact.id,
          channel: 'TELEGRAM',
          telegramAccountId: accountId,
          externalChatId: chatId,
          lastMessagePreview: msg.text,
          lastMessageAt: new Date(msg.date * 1000),
        },
      });
    } else {
      await this.prisma.inboxThread.update({
        where: { id: thread.id },
        data: {
          lastMessagePreview: msg.text,
          lastMessageAt: new Date(msg.date * 1000),
          unreadCount: { increment: 1 },
          status: 'OPEN',
        },
      });
    }

    // Save the message
    await this.prisma.inboxMessage.create({
      data: {
        threadId: thread.id,
        direction: 'INBOUND',
        message: msg.text,
        providerMessageId: String(msg.message_id),
      },
    });

    this.logger.log(`Telegram message from chat ${chatId} saved to thread ${thread.id}`);
  }
}
