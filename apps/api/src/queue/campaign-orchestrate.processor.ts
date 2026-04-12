import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import {
  CampaignRecipientStatus,
  CampaignStatus,
  MessageLogStatus,
  WhatsAppProviderType,
} from '@prisma/client';
import { TemplateRenderService } from '../messaging/template-render.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  CAMPAIGN_ORCHESTRATE_QUEUE,
  MESSAGES_SEND_QUEUE,
  type CampaignOrchestrateJob,
  type SendMessageJob,
} from './queue.constants';

@Processor(CAMPAIGN_ORCHESTRATE_QUEUE, { concurrency: 2 })
export class CampaignOrchestrateProcessor extends WorkerHost {
  private readonly logger = new Logger(CampaignOrchestrateProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly templates: TemplateRenderService,
    @InjectQueue(MESSAGES_SEND_QUEUE) private readonly sendQueue: Queue,
  ) {
    super();
  }

  async process(job: Job<CampaignOrchestrateJob, void, string>): Promise<void> {
    const { campaignId, minDelayMs, maxDelayMs } = job.data;

    const campaign = await this.prisma.campaign.findFirst({
      where: { id: campaignId },
      include: {
        template: true,
        contactGroup: { include: { members: { include: { contact: true } } } },
      },
    });

    if (!campaign || campaign.status !== CampaignStatus.RUNNING) {
      this.logger.warn(`Campaign ${campaignId} not runnable`);
      return;
    }

    const account =
      campaign.whatsappAccountId != null
        ? await this.prisma.whatsAppAccount.findFirst({
            where: {
              id: campaign.whatsappAccountId,
              workspaceId: campaign.workspaceId,
            },
          })
        : await this.prisma.whatsAppAccount.findFirst({
            where: { workspaceId: campaign.workspaceId },
            orderBy: { createdAt: 'asc' },
          });

    if (!account) {
      await this.prisma.campaign.update({
        where: { id: campaignId },
        data: { status: CampaignStatus.PAUSED },
      });
      this.logger.error(`Campaign ${campaignId}: no WhatsApp account`);
      return;
    }

    const providerLabel =
      account.providerType === WhatsAppProviderType.CLOUD ? 'CLOUD' : 'MOCK';

    const existingCount = await this.prisma.campaignRecipient.count({
      where: { campaignId },
    });

    if (existingCount === 0) {
      const contacts = campaign.contactGroup.members
        .map((m) => m.contact)
        .filter((c) => c.isValid && !c.isDuplicate);

      await this.prisma.$transaction(async (tx) => {
        if (contacts.length) {
          await tx.campaignRecipient.createMany({
            data: contacts.map((c) => ({
              campaignId,
              contactId: c.id,
              status: CampaignRecipientStatus.PENDING,
            })),
          });
        }
        await tx.campaign.update({
          where: { id: campaignId },
          data: { total: contacts.length },
        });
      });
    }

    const recipients = await this.prisma.campaignRecipient.findMany({
      where: { campaignId },
      include: { contact: true },
    });

    const resendable = new Set<CampaignRecipientStatus>([
      CampaignRecipientStatus.PENDING,
      CampaignRecipientStatus.QUEUED,
      CampaignRecipientStatus.FAILED,
    ]);
    const toSend = recipients.filter((r) => resendable.has(r.status));

    const low = Math.min(minDelayMs, maxDelayMs);
    const high = Math.max(minDelayMs, maxDelayMs);
    let cumulativeDelay = 0;

    for (const rec of toSend) {
      const contact = rec.contact;
      if (!contact || !contact.isValid || contact.isDuplicate) {
        await this.prisma.$transaction(async (tx) => {
          await tx.campaignRecipient.update({
            where: { id: rec.id },
            data: {
              status: CampaignRecipientStatus.SKIPPED,
              error: 'Invalid or duplicate contact',
            },
          });
          await tx.campaign.update({
            where: { id: campaignId },
            data: { skipped: { increment: 1 } },
          });
        });
        continue;
      }

      const body = this.templates.interpolate(campaign.template, contact);

      let messageLogId = rec.messageLogId ?? null;
      if (messageLogId) {
        await this.prisma.messageLog.update({
          where: { id: messageLogId },
          data: {
            message: body,
            status: MessageLogStatus.PENDING,
            error: null,
            whatsappAccountId: account.id,
            campaignId,
            contactId: contact.id,
          },
        });
      } else {
        const log = await this.prisma.messageLog.create({
          data: {
            workspaceId: campaign.workspaceId,
            contactId: contact.id,
            whatsappAccountId: account.id,
            message: body,
            status: MessageLogStatus.PENDING,
            provider: providerLabel,
            campaignId,
          },
        });
        messageLogId = log.id;
      }

      await this.prisma.campaignRecipient.update({
        where: { id: rec.id },
        data: {
          status: CampaignRecipientStatus.QUEUED,
          messageLogId,
          error: null,
        },
      });

      const jobPayload: SendMessageJob = {
        messageLogId,
        to: contact.phone,
        message: body,
        workspaceId: campaign.workspaceId,
        accountId: account.id,
        campaignId,
        campaignRecipientId: rec.id,
      };

      const step =
        low + (high > low ? Math.floor(Math.random() * (high - low + 1)) : 0);
      cumulativeDelay += step;

      await this.sendQueue.add('send-text', jobPayload, {
        jobId: `cmp-${campaignId}-${rec.id}`,
        delay: cumulativeDelay,
        attempts: 5,
        backoff: { type: 'exponential', delay: 2000 },
      });
    }

    await this.tryMarkCampaignCompleted(campaignId);
  }

  private async tryMarkCampaignCompleted(campaignId: string) {
    const open = await this.prisma.campaignRecipient.count({
      where: {
        campaignId,
        status: {
          in: [
            CampaignRecipientStatus.PENDING,
            CampaignRecipientStatus.QUEUED,
          ],
        },
      },
    });
    if (open === 0) {
      await this.prisma.campaign.update({
        where: { id: campaignId },
        data: { status: CampaignStatus.COMPLETED },
      });
    }
  }
}
