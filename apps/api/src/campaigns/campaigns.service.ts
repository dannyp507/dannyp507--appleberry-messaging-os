import { InjectQueue } from '@nestjs/bullmq';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Queue } from 'bullmq';
import { CampaignStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CAMPAIGN_ORCHESTRATE_QUEUE,
  type CampaignOrchestrateJob,
} from '../queue/queue.constants';
import type { CreateCampaignDto } from './dto/create-campaign.dto';
import type { StartCampaignDto } from './dto/start-campaign.dto';

@Injectable()
export class CampaignsService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(CAMPAIGN_ORCHESTRATE_QUEUE)
    private readonly orchestrateQueue: Queue,
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
      },
    });
  }

  async start(workspaceId: string, id: string, dto: StartCampaignDto) {
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

    const minDelayMs = dto.minDelayMs ?? 1000;
    const maxDelayMs = dto.maxDelayMs ?? 3000;

    await this.prisma.campaign.update({
      where: { id },
      data: { status: CampaignStatus.RUNNING },
    });

    const job: CampaignOrchestrateJob = {
      campaignId: id,
      minDelayMs,
      maxDelayMs,
    };

    await this.orchestrateQueue.add('orchestrate', job, {
      jobId: `orch-${id}`,
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
    await this.prisma.campaign.update({
      where: { id },
      data: { status: CampaignStatus.PAUSED },
    });
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
