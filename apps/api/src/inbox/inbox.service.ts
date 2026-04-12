import { Injectable, NotFoundException } from '@nestjs/common';
import { MessagesService } from '../messages/messages.service';
import { PrismaService } from '../prisma/prisma.service';
import type { SendInboxMessageDto } from './dto/send-inbox-message.dto';
import type { UpdateInboxThreadDto } from './dto/update-inbox-thread.dto';

@Injectable()
export class InboxService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly messages: MessagesService,
  ) {}

  listThreads(workspaceId: string) {
    return this.prisma.inboxThread.findMany({
      where: { workspaceId },
      orderBy: { updatedAt: 'desc' },
      include: {
        contact: { select: { id: true, firstName: true, lastName: true, phone: true } },
        assignedTo: { select: { id: true, name: true, email: true } },
        _count: { select: { messages: true } },
        messages: {
          take: 1,
          orderBy: { createdAt: 'desc' },
          select: { direction: true, message: true, createdAt: true },
        },
      },
    });
  }

  async listMessages(workspaceId: string, threadId: string) {
    const thread = await this.prisma.inboxThread.findFirst({
      where: { id: threadId, workspaceId },
    });
    if (!thread) {
      throw new NotFoundException('Thread not found');
    }
    return this.prisma.inboxMessage.findMany({
      where: { threadId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async send(workspaceId: string, dto: SendInboxMessageDto) {
    const thread = await this.prisma.inboxThread.findFirst({
      where: { id: dto.threadId, workspaceId },
      include: { contact: true },
    });
    if (!thread) {
      throw new NotFoundException('Thread not found');
    }
    return this.messages.enqueueOutboundText({
      workspaceId,
      whatsappAccountId: thread.whatsappAccountId,
      to: thread.contact.phone,
      message: dto.message,
      contactId: thread.contactId,
      inboxThreadId: thread.id,
    });
  }

  async updateThread(
    workspaceId: string,
    threadId: string,
    dto: UpdateInboxThreadDto,
  ) {
    const thread = await this.prisma.inboxThread.findFirst({
      where: { id: threadId, workspaceId },
    });
    if (!thread) {
      throw new NotFoundException('Thread not found');
    }
    return this.prisma.inboxThread.update({
      where: { id: threadId },
      data: {
        status: dto.status ?? undefined,
        assignedToId:
          dto.assignedToId === undefined ? undefined : dto.assignedToId,
      },
    });
  }
}
