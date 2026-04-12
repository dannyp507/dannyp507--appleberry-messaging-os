import { Injectable } from '@nestjs/common';
import { MessageLogStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type DashboardAnalytics = {
  totalMessages: number;
  sent: number;
  failed: number;
  pending: number;
  campaigns: number;
  inboxThreads: number;
  billing: {
    periodKey: string;
    outboundMessagesThisMonth: number;
    outboundLimit: number;
  };
};

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async dashboard(
    workspaceId: string,
    billing: {
      periodKey: string;
      outboundMessagesThisMonth: number;
      outboundLimit: number;
    },
  ): Promise<DashboardAnalytics> {
    const [totalMessages, sent, failed, pending, campaigns, inboxThreads] =
      await Promise.all([
        this.prisma.messageLog.count({ where: { workspaceId } }),
        this.prisma.messageLog.count({
          where: { workspaceId, status: MessageLogStatus.SENT },
        }),
        this.prisma.messageLog.count({
          where: { workspaceId, status: MessageLogStatus.FAILED },
        }),
        this.prisma.messageLog.count({
          where: { workspaceId, status: MessageLogStatus.PENDING },
        }),
        this.prisma.campaign.count({ where: { workspaceId } }),
        this.prisma.inboxThread.count({ where: { workspaceId } }),
      ]);

    return {
      totalMessages,
      sent,
      failed,
      pending,
      campaigns,
      inboxThreads,
      billing: {
        periodKey: billing.periodKey,
        outboundMessagesThisMonth: billing.outboundMessagesThisMonth,
        outboundLimit: billing.outboundLimit,
      },
    };
  }
}
