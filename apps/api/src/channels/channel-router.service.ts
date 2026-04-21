import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ChannelType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { FacebookPagesService } from '../facebook-pages/facebook-pages.service';
import type { InboxReplyContext } from './channel-adapter.interface';

/**
 * Routes outbound inbox replies to the correct channel-specific send method.
 */
@Injectable()
export class ChannelRouterService {
  private readonly logger = new Logger(ChannelRouterService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly fbPages: FacebookPagesService,
  ) {}

  async sendInboxReply(ctx: InboxReplyContext, message: string): Promise<void> {
    switch (ctx.channel) {
      case ChannelType.MESSENGER:
        return this.sendMessenger(ctx, message);

      case ChannelType.TELEGRAM:
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

    // Workspace-scoped lookup prevents cross-tenant sends
    const page = await this.prisma.facebookPage.findFirst({
      where: { id: ctx.facebookPageId, workspaceId: ctx.workspaceId },
    });
    if (!page) {
      throw new NotFoundException(`FacebookPage ${ctx.facebookPageId} not found`);
    }

    // Attempt the Messenger send and translate the 24-hour window error
    try {
      await this.fbPages.sendMessage(page.pageAccessToken, ctx.externalChatId, message);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Error code 10 = outside 24-hour messaging window
      if (msg.includes('outside of allowed window') || msg.includes('code 10')) {
        throw new BadRequestException(
          'Cannot reply — the 24-hour Messenger messaging window has expired. ' +
          'The customer must send a new message before you can reply.',
        );
      }
      throw err;
    }

    this.logger.log(
      `Sent Messenger reply to PSID=${ctx.externalChatId} via page=${page.pageId}`,
    );

    // Record the outbound message in the inbox
    await this.prisma.inboxMessage.create({
      data: { threadId: ctx.threadId, direction: 'OUTBOUND', message },
    });

    // Write a MessageLog row so analytics and billing counters work
    await this.prisma.messageLog.create({
      data: {
        workspaceId: ctx.workspaceId,
        channel: ChannelType.MESSENGER,
        facebookPageId: page.id,
        message,
        status: 'SENT',
        provider: 'messenger',
      },
    }).catch((e) => this.logger.warn(`MessageLog write failed: ${e}`));

    await this.prisma.inboxThread.update({
      where: { id: ctx.threadId },
      data: { lastMessagePreview: message.slice(0, 120), lastMessageAt: new Date() },
    });
  }
}
