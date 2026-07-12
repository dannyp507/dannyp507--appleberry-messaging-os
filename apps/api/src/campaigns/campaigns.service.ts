import { InjectQueue } from '@nestjs/bullmq';
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Queue } from 'bullmq';
import { CampaignRecipientStatus, CampaignStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BillingService } from '../billing/billing.service';
import {
  CAMPAIGN_ORCHESTRATE_QUEUE,
  MESSAGES_SEND_QUEUE,
  type CampaignOrchestrateJob,
} from '../queue/queue.constants';
import type { CreateCampaignDto } from './dto/create-campaign.dto';
import type { UpdateCampaignDto } from './dto/update-campaign.dto';
import type { StartCampaignDto } from './dto/start-campaign.dto';

@Injectable()
export class CampaignsService {
  private readonly logger = new Logger(CampaignsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
    @InjectQueue(CAMPAIGN_ORCHESTRATE_QUEUE)
    private readonly orchestrateQueue: Queue,
    @InjectQueue(MESSAGES_SEND_QUEUE)
    private readonly sendQueue: Queue,
  ) {}

  list(workspaceId: string) {
    return this.prisma.campaign.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
      include: {
        template: { select: { id: true, name: true } },
        contactGroup: { select: { id: true, name: true } },
      },
    });
  }

  async create(workspaceId: string, dto: CreateCampaignDto) {
    await this.billing.assertCanCreateCampaign(workspaceId);

    const template = await this.prisma.template.findFirst({
      where: { id: dto.templateId, workspaceId },
    });
    if (!template) {
      throw new NotFoundException('Template not found');
    }
    const group = await this.prisma.contactGroup.findFirst({
      where: { id: dto.contactGroupId, workspaceId },
    });
    if (!group) {
      throw new NotFoundException('Contact group not found');
    }
    if (dto.whatsappAccountId) {
      const acc = await this.prisma.whatsAppAccount.findFirst({
        where: { id: dto.whatsappAccountId, workspaceId },
      });
      if (!acc) {
        throw new NotFoundException('WhatsApp account not found');
      }
    }

    return this.prisma.campaign.create({
      data: {
        workspaceId,
        name: dto.name,
        templateId: dto.templateId,
        contactGroupId: dto.contactGroupId,
        whatsappAccountId: dto.whatsappAccountId ?? null,
        status: CampaignStatus.DRAFT,
        minDelayMs: dto.minDelayMs ?? 1000,
        maxDelayMs: dto.maxDelayMs ?? 5000,
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
        sendWindowStart: dto.sendWindowStart ?? null,
        sendWindowEnd: dto.sendWindowEnd ?? null,
      },
    });
  }

  async update(workspaceId: string, id: string, dto: UpdateCampaignDto) {
    const campaign = await this.prisma.campaign.findFirst({ where: { id, workspaceId } });
    if (!campaign) throw new NotFoundException('Campaign not found');
    if (campaign.status === CampaignStatus.RUNNING) {
      throw new BadRequestException('Pause the campaign before editing');
    }
    return this.prisma.campaign.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.templateId !== undefined && { templateId: dto.templateId }),
        ...(dto.contactGroupId !== undefined && { contactGroupId: dto.contactGroupId }),
        ...(dto.whatsappAccountId !== undefined && { whatsappAccountId: dto.whatsappAccountId }),
        ...(dto.minDelayMs !== undefined && { minDelayMs: dto.minDelayMs }),
        ...(dto.maxDelayMs !== undefined && { maxDelayMs: dto.maxDelayMs }),
        ...(dto.scheduledAt !== undefined && { scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null }),
        ...(dto.sendWindowStart !== undefined && { sendWindowStart: dto.sendWindowStart }),
        ...(dto.sendWindowEnd !== undefined && { sendWindowEnd: dto.sendWindowEnd }),
      },
    });
  }

  /** Reset a COMPLETED or PAUSED campaign back to DRAFT so it can be re-run.
   *  Clears all recipient rows and resets counters. */
  async reset(workspaceId: string, id: string) {
    const campaign = await this.prisma.campaign.findFirst({ where: { id, workspaceId } });
    if (!campaign) throw new NotFoundException('Campaign not found');
    if (campaign.status === CampaignStatus.RUNNING) {
      throw new BadRequestException('Pause the campaign before resetting');
    }
    await this.prisma.$transaction([
      this.prisma.campaignRecipient.deleteMany({ where: { campaignId: id } }),
      this.prisma.campaign.update({
        where: { id },
        data: {
          status: CampaignStatus.DRAFT,
          total: 0, sent: 0, failed: 0, skipped: 0,
          startedAt: null, completedAt: null,
        },
      }),
    ]);
    return { campaignId: id, status: CampaignStatus.DRAFT, reset: true };
  }

  async remove(workspaceId: string, id: string) {
    const campaign = await this.prisma.campaign.findFirst({ where: { id, workspaceId } });
    if (!campaign) throw new NotFoundException('Campaign not found');
    if (campaign.status === CampaignStatus.RUNNING) {
      throw new BadRequestException('Cannot delete a running campaign — pause it first');
    }
    await this.prisma.campaign.delete({ where: { id } });
    return { deleted: true };
  }

  async start(workspaceId: string, id: string, dto: StartCampaignDto) {
    await this.billing.assertCanSendOutbound(workspaceId);

    const campaign = await this.prisma.campaign.findFirst({
      where: { id, workspaceId },
    });
    if (!campaign) {
      throw new NotFoundException('Campaign not found');
    }
    if (
      campaign.status !== CampaignStatus.DRAFT &&
      campaign.status !== CampaignStatus.PAUSED
    ) {
      throw new BadRequestException('Campaign cannot be started from this state');
    }

    await this.billing.recordCampaignRun(workspaceId);

    const minDelayMs = dto.minDelayMs ?? campaign.minDelayMs ?? 1000;
    const maxDelayMs = dto.maxDelayMs ?? campaign.maxDelayMs ?? 5000;

    // When resuming a PAUSED campaign, reset any QUEUED recipients back to
    // PENDING so the orchestrator can re-queue them.  QUEUED means "a BullMQ
    // job exists for this recipient" — but the pause handler drains those jobs,
    // so QUEUED recipients are orphaned until reset here.  Doing this in start()
    // (rather than only in pause()) handles campaigns that were paused before
    // this logic existed.
    if (campaign.status === CampaignStatus.PAUSED) {
      await this.prisma.campaignRecipient.updateMany({
        where: { campaignId: id, status: CampaignRecipientStatus.QUEUED },
        data: { status: CampaignRecipientStatus.PENDING },
      });
    }

    await this.prisma.campaign.update({
      where: { id },
      data: { status: CampaignStatus.RUNNING },
    });

    const job: CampaignOrchestrateJob = {
      campaignId: id,
      minDelayMs,
      maxDelayMs,
    };

    // Use a unique jobId per run so BullMQ doesn't deduplicate against
    // a previously-completed orchestration for the same campaign.
    await this.orchestrateQueue.add('orchestrate', job, {
      jobId: `orch-${id}-${Date.now()}`,
      attempts: 2,
      backoff: { type: 'fixed', delay: 5000 },
    });

    return { campaignId: id, status: CampaignStatus.RUNNING, queued: true };
  }

  async pause(workspaceId: string, id: string) {
    const campaign = await this.prisma.campaign.findFirst({
      where: { id, workspaceId },
    });
    if (!campaign) {
      throw new NotFoundException('Campaign not found');
    }
    if (campaign.status !== CampaignStatus.RUNNING) {
      throw new BadRequestException('Campaign is not running');
    }

    // 1. Mark campaign PAUSED first so the orchestrator won't add more jobs
    //    if it happens to run between now and step 2.
    await this.prisma.campaign.update({
      where: { id },
      data: { status: CampaignStatus.PAUSED },
    });

    // 2. Reset all QUEUED recipients back to PENDING so the next Start
    //    re-queues them rather than treating them as already-in-flight.
    await this.prisma.campaignRecipient.updateMany({
      where: { campaignId: id, status: CampaignRecipientStatus.QUEUED },
      data: { status: CampaignRecipientStatus.PENDING },
    });

    // 3. Drain any delayed/waiting send jobs for this campaign from BullMQ
    //    so they don't fire while the campaign is paused.
    try {
      const pending = await this.sendQueue.getJobs(['delayed', 'waiting']);
      const campaignJobs = pending.filter((j) =>
        (j.id ?? '').startsWith(`cmp-${id}-`),
      );
      if (campaignJobs.length > 0) {
        await Promise.all(campaignJobs.map((j) => j.remove()));
        this.logger.log(
          `Campaign ${id} paused — removed ${campaignJobs.length} pending send jobs`,
        );
      }
    } catch (err) {
      // Non-fatal — log and continue; worst case some jobs fire but
      // the send processor checks campaign status before sending.
      this.logger.warn(
        `Campaign ${id}: failed to drain BullMQ jobs on pause: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    return { campaignId: id, status: CampaignStatus.PAUSED };
  }

  async report(workspaceId: string, id: string) {
    const campaign = await this.prisma.campaign.findFirst({
      where: { id, workspaceId },
      include: {
        template: true,
        contactGroup: true,
        recipients: {
          select: {
            id: true,
            status: true,
            error: true,
            contact: { select: { id: true, phone: true, firstName: true, lastName: true } },
          },
        },
      },
    });
    if (!campaign) {
      throw new NotFoundException('Campaign not found');
    }

    const byStatus = campaign.recipients.reduce<Record<string, number>>(
      (acc, r) => {
        acc[r.status] = (acc[r.status] ?? 0) + 1;
        return acc;
      },
      {},
    );

    return {
      campaign: {
        id: campaign.id,
        name: campaign.name,
        status: campaign.status,
        total: campaign.total,
        sent: campaign.sent,
        failed: campaign.failed,
        skipped: campaign.skipped,
        createdAt: campaign.createdAt,
      },
      template: { id: campaign.template.id, name: campaign.template.name },
      contactGroup: {
        id: campaign.contactGroup.id,
        name: campaign.contactGroup.name,
      },
      recipientsByStatus: byStatus,
      recipients: campaign.recipients,
    };
  }
}
