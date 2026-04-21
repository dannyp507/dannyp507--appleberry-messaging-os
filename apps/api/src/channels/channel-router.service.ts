import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ChannelType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { FacebookPagesService } from '../facebook-pages/facebook-pages.service';
import type { InboxReplyContext } from './channel-adapter.interface';

/**
 * Routes outbound inbox replies to the correct channel-specific send method.
 *
 * This service exists to break the WhatsApp-only assumption in InboxService.send().
 * Phase 1 handles MESSENGER. Telegram and full WA parity come in Phase 2.
 */
@Injectable()
export class ChannelRouterService {
  private readonly logger = new Logger(ChannelRouterService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly fbPages: FacebookPagesService,
  ) {}

  /**
   * Send an outbound inbox reply on the correct channel.
   * For WhatsApp this method is NOT called — the existing MessagesService queue path
   * handles that. This router only handles channels that bypass the WA queue.
   */
  async sendInboxReply(ctx: InboxReplyContext, message: string): Promise<void> {
    switch (ctx.channel) {
      case ChannelType.MESSENGER:
        return this.sendMessenger(ctx, message);

      case ChannelType.TELEGRAM:
        // TODO Phase 2: implement Telegram inbox reply via TelegramAccountsService
        throw new NotFoundException(
          'Telegram inbox replies are not yet supported. Coming in the next update.',
        );

      default:
        throw new Error(
          `ChannelRouterService.sendInboxReply called for channel=${ctx.channel} — ` +
            'WhatsApp should be handled by MessagesService, not this router.',
        );
    }
  }

  private async sendMessenger(ctx: InboxReplyContext, message: string): Promise<void> {
    if (!ctx.facebookPageId) {
      throw new NotFoundException('Thread is missing facebookPageId');
    }
    if (!ctx.externalChatId) {
      throw new NotFoundException('Thread is missing externalChatId (Messenger PSID)');
    }

    const page = await this.prisma.facebookPage.findFirst({
      where: { id: ctx.facebookPageId },
    });
    if (!page) {
      throw new NotFoundException(`FacebookPage ${ctx.facebookPageId} not found`);
    }

    await this.fbPages.sendMessage(page.pageAccessToken, ctx.externalChatId, message);
    this.logger.log(
      `Sent Messenger reply to PSID=${ctx.externalChatId} via page=${page.pageId}`,
    );

    await this.prisma.inboxMessage.create({
      data: {
        threadId: ctx.threadId,
        direction: 'OUTBOUND',
        message,
      },
    });

    await this.prisma.inboxThread.update({
      where: { id: ctx.threadId },
      data: {
        lastMessagePreview: message.slice(0, 120),
        lastMessageAt: new Date(),
      },
    });
  }
}
