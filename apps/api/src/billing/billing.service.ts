import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { BillingEventType, Prisma, SubscriptionStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface PlanLimits {
  messagesPerMonth: number;
  maxWhatsappAccounts: number;
  maxCampaignsPerMonth: number;
  maxContacts: number;
  maxChatbotFlows: number;
  maxApiRequestsPerDay: number;
  maxTeamMembers: number;
  hasAdvancedAnalytics: boolean;
  hasAiFeatures: boolean;
  hasApiAccess: boolean;
  hasWhiteLabel: boolean;
  hasBaileysProvider: boolean;
}

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** UTC calendar month key `YYYY-MM`. */
  periodKey(d = new Date()): string {
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  }

  /** UTC calendar day key `YYYY-MM-DD`. */
  dayKey(d = new Date()): string {
    return `${this.periodKey(d)}-${String(d.getUTCDate()).padStart(2, '0')}`;
  }

  async ensureWorkspaceSubscription(workspaceId: string) {
    const exists = await this.prisma.subscription.findUnique({ where: { workspaceId } });
    if (exists) return exists;
    const free = await this.prisma.plan.findUnique({ where: { slug: 'free' } });
    if (!free) {
      this.logger.warn('No plan with slug "free"; skipping auto-subscription');
      return null;
    }
    return this.prisma.subscription.create({
      data: { workspaceId, planId: free.id, status: SubscriptionStatus.ACTIVE },
    });
  }

  async getPlanLimits(workspaceId: string): Promise<PlanLimits> {
    await this.ensureWorkspaceSubscription(workspaceId);
    const sub = await this.prisma.subscription.findUnique({
      where: { workspaceId },
      include: { plan: true },
    });
    const plan = sub?.plan ?? (await this.prisma.plan.findUnique({ where: { slug: 'free' } }));
    if (!plan) {
      // Fallback — never block if plans aren't seeded yet
      return {
        messagesPerMonth: -1, maxWhatsappAccounts: -1, maxCampaignsPerMonth: -1,
        maxContacts: -1, maxChatbotFlows: -1, maxApiRequestsPerDay: -1,
        maxTeamMembers: -1, hasAdvancedAnalytics: true, hasAiFeatures: true,
        hasApiAccess: true, hasWhiteLabel: true, hasBaileysProvider: true,
      };
    }
    return {
      messagesPerMonth: plan.messagesPerMonth,
      maxWhatsappAccounts: plan.maxWhatsappAccounts,
      maxCampaignsPerMonth: plan.maxCampaignsPerMonth,
      maxContacts: plan.maxContacts,
      maxChatbotFlows: plan.maxChatbotFlows,
      maxApiRequestsPerDay: plan.maxApiRequestsPerDay,
      maxTeamMembers: plan.maxTeamMembers,
      hasAdvancedAnalytics: plan.hasAdvancedAnalytics,
      hasAiFeatures: plan.hasAiFeatures,
      hasApiAccess: plan.hasApiAccess,
      hasWhiteLabel: plan.hasWhiteLabel,
      hasBaileysProvider: plan.hasBaileysProvider,
    };
  }

  // ─── Outbound messages ─────────────────────────────────────────────────────

  async getOutboundLimit(workspaceId: string): Promise<number> {
    const limits = await this.getPlanLimits(workspaceId);
    return limits.messagesPerMonth;
  }

  async getOutboundUsage(workspaceId: string, period?: string): Promise<number> {
    const key = period ?? this.periodKey();
    const row = await this.prisma.workspaceUsage.findUnique({
      where: { workspaceId_periodKey: { workspaceId, periodKey: key } },
    });
    return row?.outboundMessages ?? 0;
  }

  async assertCanSendOutbound(workspaceId: string): Promise<void> {
    const limit = await this.getOutboundLimit(workspaceId);
    if (limit < 0) return;
    const used = await this.getOutboundUsage(workspaceId);
    if (used >= limit) {
      await this.recordBillingEvent(workspaceId, BillingEventType.OVERAGE_MESSAGES, { used, limit });
      throw new ForbiddenException(
        `Monthly outbound message limit reached (${limit.toLocaleString()} messages/month). Upgrade your plan to continue.`,
      );
    }
  }

  async recordOutboundSent(workspaceId: string): Promise<void> {
    const pk = this.periodKey();
    await this.prisma.workspaceUsage.upsert({
      where: { workspaceId_periodKey: { workspaceId, periodKey: pk } },
      create: { workspaceId, periodKey: pk, outboundMessages: 1 },
      update: { outboundMessages: { increment: 1 } },
    });
  }

  // ─── Contacts ──────────────────────────────────────────────────────────────

  async assertCanCreateContact(workspaceId: string): Promise<void> {
    const limits = await this.getPlanLimits(workspaceId);
    if (limits.maxContacts < 0) return;
    const count = await this.prisma.contact.count({ where: { workspaceId } });
    if (count >= limits.maxContacts) {
      await this.recordBillingEvent(workspaceId, BillingEventType.OVERAGE_CONTACTS, {
        count, limit: limits.maxContacts,
      });
      throw new ForbiddenException(
        `Contact limit reached (${limits.maxContacts.toLocaleString()} contacts). Upgrade your plan to add more.`,
      );
    }
  }

  // ─── WhatsApp accounts ─────────────────────────────────────────────────────

  async assertCanCreateWhatsAppAccount(workspaceId: string): Promise<void> {
    const limits = await this.getPlanLimits(workspaceId);
    if (limits.maxWhatsappAccounts < 0) return;
    const count = await this.prisma.whatsAppAccount.count({
      where: { workspaceId, isArchived: false },
    });
    if (count >= limits.maxWhatsappAccounts) {
      throw new ForbiddenException(
        `WhatsApp account limit reached (${limits.maxWhatsappAccounts}). Upgrade your plan to add more accounts.`,
      );
    }
  }

  // ─── Campaigns ─────────────────────────────────────────────────────────────

  async assertCanCreateCampaign(workspaceId: string): Promise<void> {
    const limits = await this.getPlanLimits(workspaceId);
    if (limits.maxCampaignsPerMonth < 0) return;
    const pk = this.periodKey();
    const usage = await this.prisma.workspaceUsage.findUnique({
      where: { workspaceId_periodKey: { workspaceId, periodKey: pk } },
    });
    const campaignsRun = usage?.campaignsRun ?? 0;
    if (campaignsRun >= limits.maxCampaignsPerMonth) {
      throw new ForbiddenException(
        `Monthly campaign limit reached (${limits.maxCampaignsPerMonth} campaigns/month). Upgrade your plan.`,
      );
    }
  }

  async recordCampaignRun(workspaceId: string): Promise<void> {
    const pk = this.periodKey();
    await this.prisma.workspaceUsage.upsert({
      where: { workspaceId_periodKey: { workspaceId, periodKey: pk } },
      create: { workspaceId, periodKey: pk, campaignsRun: 1 },
      update: { campaignsRun: { increment: 1 } },
    });
  }

  // ─── Chatbot flows ─────────────────────────────────────────────────────────

  async assertCanCreateChatbotFlow(workspaceId: string): Promise<void> {
    const limits = await this.getPlanLimits(workspaceId);
    if (limits.maxChatbotFlows < 0) return;
    const count = await this.prisma.chatbotFlow.count({
      where: { workspaceId, status: { not: 'ARCHIVED' } },
    });
    if (count >= limits.maxChatbotFlows) {
      throw new ForbiddenException(
        `Chatbot flow limit reached (${limits.maxChatbotFlows} flows). Upgrade your plan.`,
      );
    }
  }

  // ─── Team members ──────────────────────────────────────────────────────────

  async assertCanAddTeamMember(workspaceId: string): Promise<void> {
    const limits = await this.getPlanLimits(workspaceId);
    if (limits.maxTeamMembers < 0) return;
    const count = await this.prisma.workspaceMembership.count({ where: { workspaceId } });
    if (count >= limits.maxTeamMembers) {
      throw new ForbiddenException(
        `Team member limit reached (${limits.maxTeamMembers} members). Upgrade your plan.`,
      );
    }
  }

  // ─── Feature flags ─────────────────────────────────────────────────────────

  async assertHasApiAccess(workspaceId: string): Promise<void> {
    const limits = await this.getPlanLimits(workspaceId);
    if (!limits.hasApiAccess) {
      throw new ForbiddenException('API access requires a Starter plan or higher.');
    }
  }

  async assertHasAiFeatures(workspaceId: string): Promise<void> {
    const limits = await this.getPlanLimits(workspaceId);
    if (!limits.hasAiFeatures) {
      throw new ForbiddenException('AI features require a Pro plan or higher.');
    }
  }

  async assertHasAdvancedAnalytics(workspaceId: string): Promise<void> {
    const limits = await this.getPlanLimits(workspaceId);
    if (!limits.hasAdvancedAnalytics) {
      throw new ForbiddenException('Advanced analytics require a Pro plan or higher.');
    }
  }

  async assertHasBaileysProvider(workspaceId: string): Promise<void> {
    const limits = await this.getPlanLimits(workspaceId);
    if (!limits.hasBaileysProvider) {
      throw new ForbiddenException('WhatsApp unofficial sessions require a Pro plan or higher.');
    }
  }

  // ─── API requests ──────────────────────────────────────────────────────────

  async recordApiRequest(workspaceId: string): Promise<void> {
    const pk = this.periodKey();
    await this.prisma.workspaceUsage.upsert({
      where: { workspaceId_periodKey: { workspaceId, periodKey: pk } },
      create: { workspaceId, periodKey: pk, apiRequests: 1 },
      update: { apiRequests: { increment: 1 } },
    });
  }

  async recordContactCreated(workspaceId: string): Promise<void> {
    const pk = this.periodKey();
    await this.prisma.workspaceUsage.upsert({
      where: { workspaceId_periodKey: { workspaceId, periodKey: pk } },
      create: { workspaceId, periodKey: pk, contactsCreated: 1 },
      update: { contactsCreated: { increment: 1 } },
    });
  }

  // ─── Billing events ────────────────────────────────────────────────────────

  async recordBillingEvent(
    workspaceId: string,
    type: BillingEventType,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    await this.prisma.billingEvent.create({ data: { workspaceId, type, metadata: (metadata as Prisma.InputJsonValue) ?? Prisma.JsonNull } });
  }

  // ─── Usage summary ─────────────────────────────────────────────────────────

  async getUsageSummary(workspaceId: string) {
    const limits = await this.getPlanLimits(workspaceId);
    const pk = this.periodKey();
    const usage = await this.prisma.workspaceUsage.findUnique({
      where: { workspaceId_periodKey: { workspaceId, periodKey: pk } },
    });
    const [contacts, whatsappAccounts, chatbotFlows, teamMembers] = await Promise.all([
      this.prisma.contact.count({ where: { workspaceId } }),
      this.prisma.whatsAppAccount.count({ where: { workspaceId, isArchived: false } }),
      this.prisma.chatbotFlow.count({ where: { workspaceId, status: { not: 'ARCHIVED' } } }),
      this.prisma.workspaceMembership.count({ where: { workspaceId } }),
    ]);
    return {
      period: pk,
      messages: { used: usage?.outboundMessages ?? 0, limit: limits.messagesPerMonth },
      campaigns: { used: usage?.campaignsRun ?? 0, limit: limits.maxCampaignsPerMonth },
      contacts: { used: contacts, limit: limits.maxContacts },
      whatsappAccounts: { used: whatsappAccounts, limit: limits.maxWhatsappAccounts },
      chatbotFlows: { used: chatbotFlows, limit: limits.maxChatbotFlows },
      teamMembers: { used: teamMembers, limit: limits.maxTeamMembers },
      apiRequests: { used: usage?.apiRequests ?? 0, limit: limits.maxApiRequestsPerDay },
      features: {
        hasAdvancedAnalytics: limits.hasAdvancedAnalytics,
        hasAiFeatures: limits.hasAiFeatures,
        hasApiAccess: limits.hasApiAccess,
        hasWhiteLabel: limits.hasWhiteLabel,
        hasBaileysProvider: limits.hasBaileysProvider,
      },
    };
  }
}
