import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ChannelType } from '@prisma/client';

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
    const phone = `tg:${from?.id ?? chatId}`;

    // Find or create contact
    let contact = await this.prisma.contact.findFirst({
      where: { workspaceId: account.workspaceId, phone },
    });
    if (!contact) {
      contact = await this.prisma.contact.create({
        data: {
          workspaceId: account.workspaceId,
          phone,
          firstName: from?.first_name ?? 'Telegram',
          lastName: from?.last_name ?? '',
        },
      });
    }

    // Find or create inbox thread
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
          channel: ChannelType.TELEGRAM,
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
