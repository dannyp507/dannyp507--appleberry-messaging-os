import { Processor, WorkerHost } from '@nestjs/bullmq';
import { ForbiddenException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job } from 'bullmq';
import * as path from 'path';
import {
  CampaignRecipientStatus,
  CampaignStatus,
  MessageLogStatus,
  WhatsAppProviderType,
} from '@prisma/client';
import { BillingService } from '../billing/billing.service';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsAppProviderFactory } from '../providers/whatsapp/whatsapp-provider.factory';
import { RedisService } from '../redis/redis.service';
import { MESSAGES_SEND_QUEUE, type SendMessageJob } from './queue.constants';

@Processor(MESSAGES_SEND_QUEUE, { concurrency: 5 })
export class MessageSendProcessor extends WorkerHost {
  private readonly logger = new Logger(MessageSendProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly providerFactory: WhatsAppProviderFactory,
    private readonly redis: RedisService,
    private readonly config: ConfigService,
    private readonly billing: BillingService,
  ) {
    super();
  }

  private get maxPerMinute(): number {
    return Number(this.config.get<string>('WHATSAPP_RATE_LIMIT_PER_MIN', '40'));
  }

  private randomDelayMs(min: number, max: number): number {
    if (max <= min) return min;
    return min + Math.floor(Math.random() * (max - min + 1));
  }

  async process(job: Job<SendMessageJob, void, string>): Promise<void> {
    const {
      messageLogId,
      to,
      message,
      accountId,
      campaignRecipientId,
      campaignId,
      mediaUrl,
      interactive,
    } = job.data;

    const log = await this.prisma.messageLog.findUnique({
      where: { id: messageLogId },
      include: { account: true },
    });

    if (!log || log.whatsappAccountId !== accountId) {
      this.logger.warn(`MessageLog ${messageLogId} missing or account mismatch`);
      return;
    }

    if (campaignId && campaignRecipientId) {
      const campaign = await this.prisma.campaign.findUnique({
        where: { id: campaignId },
      });
      if (!campaign) {
        // Campaign was deleted — mark skipped and bail.
        await this.skipRecipient(campaignRecipientId, 'Campaign not found');
        return;
      }
      if (campaign.status !== CampaignStatus.RUNNING) {
        // Campaign was paused or completed while this job was in flight.
        // The pause handler already reset QUEUED → PENDING, so just discard
        // this job without touching the recipient row — it will be re-queued
        // on the next Start.
        this.logger.log(
          `Discarding send job for recipient ${campaignRecipientId} — campaign ${campaignId} is ${campaign.status}`,
        );
        return;
      }
    }

    const jitterCfgMin = Number(
      this.config.get<string>('CAMPAIGN_JITTER_MIN_MS', '0'),
    );
    const jitterCfgMax = Number(
      this.config.get<string>('CAMPAIGN_JITTER_MAX_MS', '0'),
    );
    if (jitterCfgMax > 0) {
      await new Promise((r) =>
        setTimeout(r, this.randomDelayMs(jitterCfgMin, jitterCfgMax)),
      );
    }

    await this.redis.throttleWhatsappAccount(accountId, this.maxPerMinute);

    const providerType = log.account.providerType;
    const provider = this.providerFactory.getProvider(providerType);

    try {
      try {
        await this.billing.assertCanSendOutbound(log.workspaceId);
      } catch (err) {
        if (err instanceof ForbiddenException) {
          const r = err.getResponse();
          const msg =
            typeof r === 'string'
              ? r
              : r &&
                  typeof r === 'object' &&
                  'message' in r &&
                  (r as { message: string | string[] }).message != null
                ? Array.isArray((r as { message: string[] }).message)
                  ? (r as { message: string[] }).message.join(', ')
                  : String((r as { message: string }).message)
                : err.message;
          await this.failSend(
            messageLogId,
            campaignRecipientId,
            campaignId,
            msg,
          );
          return;
        }
        throw err;
      }

      if (interactive) {
        // Interactive message (buttons / list) — Cloud API only; fall back to text on others
        if (provider.sendInteractive) {
          await provider.sendInteractive(to, interactive, accountId);
        } else {
          // Non-Cloud provider: send body text as plain message
          await provider.sendText(to, interactive.body.text ?? message, accountId);
        }
      } else if (mediaUrl) {
        // If mediaUrl is a full HTTP(S) URL pass it straight through — the provider
        // (Baileys) will download it directly.  Only do the local-path resolution
        // for legacy relative paths that start with /uploads/.
        let resolvedMedia: string;
        if (mediaUrl.startsWith('http://') || mediaUrl.startsWith('https://')) {
          resolvedMedia = mediaUrl;
        } else {
          const uploadsBase = this.config.get<string>('UPLOADS_BASE_DIR') ?? '/app/uploads';
          const relPath = mediaUrl.startsWith('/uploads')
            ? mediaUrl.slice('/uploads'.length)
            : mediaUrl;
          resolvedMedia = path.join(uploadsBase, relPath);
        }
        if (provider.sendMedia) {
          await provider.sendMedia(to, resolvedMedia, message || undefined, accountId);
        } else {
          // Provider doesn't support media — fall back to text caption
          if (message) await provider.sendText(to, message, accountId);
        }
      } else {
        await provider.sendText(to, message, accountId);
      }
      await this.prisma.$transaction(async (tx) => {
        await tx.messageLog.update({
          where: { id: messageLogId },
          data: {
            status: MessageLogStatus.SENT,
            provider:
              providerType === WhatsAppProviderType.CLOUD ? 'CLOUD' : 'MOCK',
            error: null,
          },
        });
        if (campaignRecipientId && campaignId) {
          await tx.campaignRecipient.update({
            where: { id: campaignRecipientId },
            data: { status: CampaignRecipientStatus.SENT },
          });
          await tx.campaign.update({
            where: { id: campaignId },
            data: { sent: { increment: 1 } },
          });
        }
      });
      await this.billing.recordOutboundSent(log.workspaceId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Send failed for log ${messageLogId}: ${msg}`);

      // Only count this as a campaign failure on the FINAL attempt.
      // BullMQ's job.attemptsMade is 0-indexed before the current attempt fires,
      // so when attemptsMade + 1 >= maxAttempts we've exhausted all retries.
      const maxAttempts = job.opts.attempts ?? 1;
      const isFinalAttempt = (job.attemptsMade + 1) >= maxAttempts;

      await this.prisma.$transaction(async (tx) => {
        await tx.messageLog.update({
          where: { id: messageLogId },
          data: {
            status: MessageLogStatus.FAILED,
            provider:
              providerType === WhatsAppProviderType.CLOUD ? 'CLOUD' : 'MOCK',
            error: msg,
          },
        });
        if (campaignRecipientId && campaignId) {
          await tx.campaignRecipient.update({
            where: { id: campaignRecipientId },
            data: {
              status: CampaignRecipientStatus.FAILED,
              error: msg,
            },
          });
          // Only increment the campaign failed counter on the last attempt —
          // retries would otherwise inflate the count far beyond the recipient total.
          if (isFinalAttempt) {
            await tx.campaign.update({
              where: { id: campaignId },
              data: { failed: { increment: 1 } },
            });
          }
        }
      });
      if (campaignId && isFinalAttempt) {
        await this.tryMarkCampaignCompleted(campaignId);
      }
      throw err;
    }

    if (campaignId) {
      await this.tryMarkCampaignCompleted(campaignId);
    }
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

  private async failSend(
    messageLogId: string,
    campaignRecipientId: string | undefined,
    campaignId: string | undefined,
    reason: string,
  ) {
    await this.prisma.$transaction(async (tx) => {
      await tx.messageLog.update({
        where: { id: messageLogId },
        data: {
          status: MessageLogStatus.FAILED,
          error: reason,
        },
      });
      if (campaignRecipientId && campaignId) {
        await tx.campaignRecipient.update({
          where: { id: campaignRecipientId },
          data: {
            status: CampaignRecipientStatus.FAILED,
            error: reason,
          },
        });
        await tx.campaign.update({
          where: { id: campaignId },
          data: { failed: { increment: 1 } },
        });
      }
    });
    if (campaignId) {
      await this.tryMarkCampaignCompleted(campaignId);
    }
  }

  private async skipRecipient(recipientId: string, reason: string) {
    const rec = await this.prisma.campaignRecipient.findUnique({
      where: { id: recipientId },
    });
    if (!rec) return;
    await this.prisma.$transaction(async (tx) => {
      await tx.campaignRecipient.update({
        where: { id: recipientId },
        data: {
          status: CampaignRecipientStatus.SKIPPED,
          error: reason,
        },
      });
      await tx.campaign.update({
        where: { id: rec.campaignId },
        data: { skipped: { increment: 1 } },
      });
      if (rec.messageLogId) {
        await tx.messageLog.update({
          where: { id: rec.messageLogId },
          data: { status: MessageLogStatus.FAILED, error: reason },
        });
      }
    });
    await this.tryMarkCampaignCompleted(rec.campaignId);
  }
}
