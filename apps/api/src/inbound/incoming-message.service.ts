import { Injectable, Logger } from '@nestjs/common';
import {
  AutoresponderMatchType,
  ChatbotFlowStatus,
  InboxMessageDirection,
  InboxThreadStatus,
  KeywordActionType,
  KeywordMatchType,
} from '@prisma/client';
import { AiService } from '../ai/ai.service';
import { ChatbotEngineService } from '../chatbot/chatbot-engine.service';
import { TemplateRenderService } from '../messaging/template-render.service';
import { MessagesService } from '../messages/messages.service';
import { PrismaService } from '../prisma/prisma.service';
import type { IncomingMessageJob } from '../queue/queue.constants';
import { normalizePhoneE164 } from '../contacts/phone.util';

@Injectable()
export class IncomingMessageService {
  private readonly logger = new Logger(IncomingMessageService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly chatbot: ChatbotEngineService,
    private readonly templates: TemplateRenderService,
    private readonly messages: MessagesService,
    private readonly ai: AiService,
  ) {}

  async dispatch(job: IncomingMessageJob): Promise<void> {
    const account = await this.prisma.whatsAppAccount.findUnique({
      where: { id: job.whatsappAccountId },
    });
    if (!account) {
      this.logger.warn(`Unknown WhatsApp account ${job.whatsappAccountId}`);
      return;
    }

    const workspaceId = account.workspaceId;
    const { e164, isValid } = normalizePhoneE164(job.from, 'ZA');

    let contact = await this.prisma.contact.findFirst({
      where: { workspaceId, phone: e164 },
    });
    if (!contact) {
      contact = await this.prisma.contact.create({
        data: {
          workspaceId,
          firstName: 'Unknown',
          lastName: '',
          phone: e164,
          isValid,
          isDuplicate: false,
        },
      });
    }

    const thread = await this.prisma.inboxThread.upsert({
      where: {
        workspaceId_contactId_whatsappAccountId: {
          workspaceId,
          contactId: contact.id,
          whatsappAccountId: account.id,
        },
      },
      update: { status: InboxThreadStatus.OPEN, updatedAt: new Date() },
      create: {
        workspaceId,
        contactId: contact.id,
        whatsappAccountId: account.id,
        status: InboxThreadStatus.OPEN,
      },
    });

    await this.prisma.inboxMessage.create({
      data: {
        threadId: thread.id,
        direction: InboxMessageDirection.INBOUND,
        message: job.text,
      },
    });

    const ctx = {
      workspaceId,
      whatsappAccountId: account.id,
      contactId: contact.id,
      text: job.text,
      inboxThreadId: thread.id,
    };

    const continued = await this.chatbot.handleIncomingMessage(ctx);
    if (continued) {
      return;
    }

    const triggers = await this.prisma.keywordTrigger.findMany({
      where: { workspaceId, active: true },
      orderBy: { createdAt: 'asc' },
    });
    for (const t of triggers) {
      if (!this.keywordMatches(t.keyword, t.matchType, job.text)) {
        continue;
      }
      if (t.actionType === KeywordActionType.START_FLOW) {
        await this.chatbot.startFlow({
          workspaceId,
          whatsappAccountId: account.id,
          contactId: contact.id,
          flowId: t.targetId,
          inboxThreadId: thread.id,
        });
        return;
      }
      if (t.actionType === KeywordActionType.SEND_TEMPLATE) {
        const template = await this.prisma.template.findFirst({
          where: { id: t.targetId, workspaceId },
        });
        if (!template) continue;
        const body = this.templates.interpolate(template, contact);
        await this.messages.enqueueOutboundText({
          workspaceId,
          whatsappAccountId: account.id,
          to: contact.phone,
          message: body,
          contactId: contact.id,
          inboxThreadId: thread.id,
        });
        return;
      }
    }

    const rules = await this.prisma.autoresponderRule.findMany({
      where: { workspaceId, active: true },
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
    });
    for (const r of rules) {
      if (!this.keywordMatches(r.keyword, r.matchType, job.text)) {
        continue;
      }
      await this.messages.enqueueOutboundText({
        workspaceId,
        whatsappAccountId: account.id,
        to: contact.phone,
        message: r.response,
        contactId: contact.id,
        inboxThreadId: thread.id,
      });
      return;
    }

    const recent = await this.prisma.inboxMessage.findMany({
      where: { threadId: thread.id },
      orderBy: { createdAt: 'desc' },
      take: 16,
      select: { direction: true, message: true },
    });

    const reply = await this.ai.generateReply(
      {
        workspaceId,
        contactId: contact.id,
        threadId: thread.id,
        recentMessages: recent.reverse(),
      },
      job.text,
    );

    if (reply?.trim()) {
      await this.messages.enqueueOutboundText({
        workspaceId,
        whatsappAccountId: account.id,
        to: contact.phone,
        message: reply.trim(),
        contactId: contact.id,
        inboxThreadId: thread.id,
      });
    }
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
    if (mode === KeywordMatchType.EXACT || mode === AutoresponderMatchType.EXACT) {
      return t === k;
    }
    return t.includes(k);
  }
}
