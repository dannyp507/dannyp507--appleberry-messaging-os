import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
  InboxMessageDirection,
  MessageLogStatus,
  WhatsAppProviderType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  MESSAGES_SEND_QUEUE,
  type SendMessageJob,
} from '../queue/queue.constants';
import type { SendMessageDto } from './dto/send-message.dto';

@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(MESSAGES_SEND_QUEUE) private readonly sendQueue: Queue,
  ) {}

  async enqueueSend(workspaceId: string, dto: SendMessageDto) {
    const account = dto.whatsappAccountId
      ? await this.prisma.whatsAppAccount.findFirst({
          where: { id: dto.whatsappAccountId, workspaceId },
        })
      : await this.prisma.whatsAppAccount.findFirst({
          where: { workspaceId },
          orderBy: { createdAt: 'asc' },
        });

    if (!account) {
      throw new NotFoundException('No WhatsApp account found for workspace');
    }

    const providerLabel =
      account.providerType === WhatsAppProviderType.CLOUD ? 'CLOUD' : 'MOCK';

    const log = await this.prisma.messageLog.create({
      data: {
        workspaceId,
        whatsappAccountId: account.id,
        contactId: dto.contactId ?? null,
        message: dto.message,
        status: MessageLogStatus.PENDING,
        provider: providerLabel,
      },
    });

    const job: SendMessageJob = {
      messageLogId: log.id,
      to: dto.to,
      message: dto.message,
      workspaceId,
      accountId: account.id,
    };

    await this.sendQueue.add('send-text', job, {
      jobId: `msg-${log.id}`,
      attempts: 5,
      backoff: { type: 'exponential', delay: 2000 },
    });

    return {
      messageLogId: log.id,
      status: MessageLogStatus.PENDING,
      queued: true,
    };
  }

  /**
   * Outbound pipeline used by inbox, chatbot, autoresponders, and keyword actions.
   * Optionally records an inbox line item when `inboxThreadId` is provided.
   * When `mediaUrl` is provided the queued job will send a media message instead
   * of plain text; `message` becomes the caption.
   */
  async enqueueOutboundText(params: {
    workspaceId: string;
    whatsappAccountId: string | null | undefined;
    to: string;
    message: string;
    contactId?: string | null;
    inboxThreadId?: string | null;
    mediaUrl?: string | null;
  }) {
    if (!params.whatsappAccountId) {
      throw new NotFoundException(
        'enqueueOutboundText requires a whatsappAccountId — ' +
          'use ChannelRouterService for non-WhatsApp channels',
      );
    }
    const account = await this.prisma.whatsAppAccount.findFirst({
      where: { id: params.whatsappAccountId, workspaceId: params.workspaceId },
    });
    if (!account) {
      throw new NotFoundException('WhatsApp account not found');
    }

    const providerLabel =
      account.providerType === WhatsAppProviderType.CLOUD ? 'CLOUD' : 'MOCK';

    const log = await this.prisma.messageLog.create({
      data: {
        workspaceId: params.workspaceId,
        whatsappAccountId: account.id,
        contactId: params.contactId ?? null,
        message: params.message,
        status: MessageLogStatus.PENDING,
        provider: providerLabel,
      },
    });

    if (params.inboxThreadId) {
      await this.prisma.inboxMessage.create({
        data: {
          threadId: params.inboxThreadId,
          direction: InboxMessageDirection.OUTBOUND,
          message: params.message,
        },
      });
    }

    const job: SendMessageJob = {
      messageLogId: log.id,
      to: params.to,
      message: params.message,
      workspaceId: params.workspaceId,
      accountId: account.id,
      ...(params.mediaUrl ? { mediaUrl: params.mediaUrl } : {}),
    };

    await this.sendQueue.add('send-text', job, {
      jobId: `msg-${log.id}`,
      attempts: 5,
      backoff: { type: 'exponential', delay: 2000 },
    });

    return { messageLogId: log.id, status: MessageLogStatus.PENDING, queued: true };
  }
}
