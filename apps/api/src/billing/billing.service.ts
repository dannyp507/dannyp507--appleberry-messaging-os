import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { SubscriptionStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** UTC calendar month key `YYYY-MM`. */
  periodKey(d = new Date()): string {
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  }

  async ensureWorkspaceSubscription(workspaceId: string) {
    const exists = await this.prisma.subscription.findUnique({
      where: { workspaceId },
    });
    if (exists) {
      return exists;
    }
    const free = await this.prisma.plan.findUnique({ where: { slug: 'free' } });
    if (!free) {
      this.logger.warn('No plan with slug "free"; skipping auto-subscription');
      return null;
    }
    return this.prisma.subscription.create({
      data: {
        workspaceId,
        planId: free.id,
        status: SubscriptionStatus.ACTIVE,
      },
    });
  }

  /** -1 means unlimited. */
  async getOutboundLimit(workspaceId: string): Promise<number> {
    await this.ensureWorkspaceSubscription(workspaceId);
    const sub = await this.prisma.subscription.findUnique({
      where: { workspaceId },
      include: { plan: true },
    });
    if (!sub) {
      const free = await this.prisma.plan.findUnique({ where: { slug: 'free' } });
      return free?.messagesPerMonth ?? -1;
    }
    if (sub.status !== SubscriptionStatus.ACTIVE) {
      const free = await this.prisma.plan.findUnique({ where: { slug: 'free' } });
      return free?.messagesPerMonth ?? -1;
    }
    return sub.plan.messagesPerMonth;
  }

  async getOutboundUsage(workspaceId: string, period?: string): Promise<number> {
    const key = period ?? this.periodKey();
    const row = await this.prisma.workspaceUsage.findUnique({
      where: {
        workspaceId_periodKey: { workspaceId, periodKey: key },
      },
    });
    return row?.outboundMessages ?? 0;
  }

  async assertCanSendOutbound(workspaceId: string): Promise<void> {
    const limit = await this.getOutboundLimit(workspaceId);
    if (limit < 0) {
      return;
    }
    const used = await this.getOutboundUsage(workspaceId);
    if (used >= limit) {
      throw new ForbiddenException(
        `Outbound message limit reached for this billing period (${limit} messages/month).`,
      );
    }
  }

  async recordOutboundSent(workspaceId: string): Promise<void> {
    const pk = this.periodKey();
    await this.prisma.workspaceUsage.upsert({
      where: {
        workspaceId_periodKey: { workspaceId, periodKey: pk },
      },
      create: { workspaceId, periodKey: pk, outboundMessages: 1 },
      update: { outboundMessages: { increment: 1 } },
    });
  }
}
