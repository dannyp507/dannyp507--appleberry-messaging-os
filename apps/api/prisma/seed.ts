import { PrismaClient, WhatsAppProviderType } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const PERMISSIONS = [
  { key: 'manage_users', description: 'Invite and manage members' },
  { key: 'manage_contacts', description: 'Manage CRM contacts' },
  { key: 'manage_campaigns', description: 'Create and run campaigns' },
  { key: 'manage_templates', description: 'Manage message templates' },
  { key: 'send_messages', description: 'Send WhatsApp messages' },
  { key: 'manage_whatsapp', description: 'Manage WhatsApp accounts' },
  { key: 'manage_facebook', description: 'Manage Facebook pages and Messenger' },
  { key: 'view_reports', description: 'View analytics and reports' },
  { key: 'manage_inbox', description: 'View and manage inbox threads' },
  { key: 'manage_chatbot', description: 'Configure chatbot flows' },
  { key: 'manage_automation', description: 'Keyword triggers and autoresponders' },
  { key: 'manage_api_keys', description: 'Create and revoke API keys' },
  { key: 'manage_webhooks', description: 'Manage webhook endpoints' },
  { key: 'view_audit_logs', description: 'View audit and activity logs' },
  { key: 'manage_billing', description: 'View and manage billing' },
] as const;

const ROLE_DEFS = [
  {
    name: 'SuperAdmin',
    slug: 'superadmin',
    keys: [...PERMISSIONS.map((p) => p.key)],
  },
  {
    name: 'Owner',
    slug: 'owner',
    keys: [...PERMISSIONS.map((p) => p.key)],
  },
  {
    name: 'Admin',
    slug: 'admin',
    keys: [
      'manage_users', 'manage_contacts', 'manage_campaigns',
      'manage_templates', 'send_messages', 'manage_whatsapp',
      'manage_facebook', 'view_reports', 'manage_inbox', 'manage_chatbot',
      'manage_automation', 'manage_api_keys', 'manage_webhooks',
      'view_audit_logs',
    ],
  },
  {
    name: 'Agent',
    slug: 'agent',
    keys: [
      'manage_contacts', 'manage_templates', 'manage_campaigns',
      'send_messages', 'view_reports', 'manage_inbox',
      'manage_chatbot', 'manage_automation',
    ],
  },
  { name: 'Viewer', slug: 'viewer', keys: ['view_reports'] },
] as const;

async function upsertPlans() {
  const free = await prisma.plan.upsert({
    where: { slug: 'free' },
    update: {
      name: 'Free',
      messagesPerMonth: 1_000,
      maxWhatsappAccounts: 1,
      maxCampaignsPerMonth: 3,
      maxContacts: 500,
      maxChatbotFlows: 2,
      maxApiRequestsPerDay: 100,
      maxTeamMembers: 2,
      hasAdvancedAnalytics: false,
      hasAiFeatures: false,
      hasApiAccess: false,
      hasWhiteLabel: false,
      hasBaileysProvider: false,
    },
    create: {
      name: 'Free',
      slug: 'free',
      messagesPerMonth: 1_000,
      maxWhatsappAccounts: 1,
      maxCampaignsPerMonth: 3,
      maxContacts: 500,
      maxChatbotFlows: 2,
      maxApiRequestsPerDay: 100,
      maxTeamMembers: 2,
      hasAdvancedAnalytics: false,
      hasAiFeatures: false,
      hasApiAccess: false,
      hasWhiteLabel: false,
      hasBaileysProvider: false,
      priceMonthlyUsd: 0,
    },
  });

  await prisma.plan.upsert({
    where: { slug: 'starter' },
    update: {
      name: 'Starter',
      messagesPerMonth: 10_000,
      maxWhatsappAccounts: 3,
      maxCampaignsPerMonth: 20,
      maxContacts: 5_000,
      maxChatbotFlows: 10,
      maxApiRequestsPerDay: 1_000,
      maxTeamMembers: 5,
      hasAdvancedAnalytics: false,
      hasAiFeatures: false,
      hasApiAccess: true,
      hasWhiteLabel: false,
      hasBaileysProvider: false,
    },
    create: {
      name: 'Starter',
      slug: 'starter',
      messagesPerMonth: 10_000,
      maxWhatsappAccounts: 3,
      maxCampaignsPerMonth: 20,
      maxContacts: 5_000,
      maxChatbotFlows: 10,
      maxApiRequestsPerDay: 1_000,
      maxTeamMembers: 5,
      hasAdvancedAnalytics: false,
      hasAiFeatures: false,
      hasApiAccess: true,
      hasWhiteLabel: false,
      hasBaileysProvider: false,
      priceMonthlyUsd: 29,
    },
  });

  await prisma.plan.upsert({
    where: { slug: 'pro' },
    update: {
      name: 'Pro',
      messagesPerMonth: 50_000,
      maxWhatsappAccounts: 10,
      maxCampaignsPerMonth: 100,
      maxContacts: 50_000,
      maxChatbotFlows: 50,
      maxApiRequestsPerDay: 10_000,
      maxTeamMembers: 20,
      hasAdvancedAnalytics: true,
      hasAiFeatures: true,
      hasApiAccess: true,
      hasWhiteLabel: false,
      hasBaileysProvider: true,
    },
    create: {
      name: 'Pro',
      slug: 'pro',
      messagesPerMonth: 50_000,
      maxWhatsappAccounts: 10,
      maxCampaignsPerMonth: 100,
      maxContacts: 50_000,
      maxChatbotFlows: 50,
      maxApiRequestsPerDay: 10_000,
      maxTeamMembers: 20,
      hasAdvancedAnalytics: true,
      hasAiFeatures: true,
      hasApiAccess: true,
      hasWhiteLabel: false,
      hasBaileysProvider: true,
      priceMonthlyUsd: 99,
    },
  });

  await prisma.plan.upsert({
    where: { slug: 'enterprise' },
    update: {
      name: 'Enterprise',
      messagesPerMonth: -1,
      maxWhatsappAccounts: -1,
      maxCampaignsPerMonth: -1,
      maxContacts: -1,
      maxChatbotFlows: -1,
      maxApiRequestsPerDay: -1,
      maxTeamMembers: -1,
      hasAdvancedAnalytics: true,
      hasAiFeatures: true,
      hasApiAccess: true,
      hasWhiteLabel: true,
      hasBaileysProvider: true,
    },
    create: {
      name: 'Enterprise',
      slug: 'enterprise',
      messagesPerMonth: -1,
      maxWhatsappAccounts: -1,
      maxCampaignsPerMonth: -1,
      maxContacts: -1,
      maxChatbotFlows: -1,
      maxApiRequestsPerDay: -1,
      maxTeamMembers: -1,
      hasAdvancedAnalytics: true,
      hasAiFeatures: true,
      hasApiAccess: true,
      hasWhiteLabel: true,
      hasBaileysProvider: true,
      priceMonthlyUsd: null,
    },
  });

  return free;
}

async function backfillSubscriptions(freePlanId: string) {
  const missing = await prisma.workspace.findMany({
    where: { subscription: null },
    select: { id: true },
  });
  for (const w of missing) {
    await prisma.subscription.create({
      data: { workspaceId: w.id, planId: freePlanId, status: 'ACTIVE' },
    });
  }
}

async function main() {
  const freePlan = await upsertPlans();

  const permissionRecords = await Promise.all(
    PERMISSIONS.map((p) =>
      prisma.permission.upsert({
        where: { key: p.key },
        update: { description: p.description },
        create: { key: p.key, description: p.description },
      }),
    ),
  );

  const keyToId = new Map(permissionRecords.map((perm) => [perm.key, perm.id]));

  for (const role of ROLE_DEFS) {
    const r = await prisma.role.upsert({
      where: { slug: role.slug },
      update: { name: role.name },
      create: { name: role.name, slug: role.slug, isSystem: true },
    });
    await prisma.rolePermission.deleteMany({ where: { roleId: r.id } });
    for (const key of role.keys) {
      const permId = keyToId.get(key);
      if (!permId) continue;
      await prisma.rolePermission.create({
        data: { roleId: r.id, permissionId: permId },
      });
    }
  }

  const ownerRole = await prisma.role.findUniqueOrThrow({ where: { slug: 'owner' } });

  const passwordHash = await bcrypt.hash('password123', 12);
  const existing = await prisma.user.findUnique({ where: { email: 'admin@appleberry.local' } });

  if (existing) {
    await backfillSubscriptions(freePlan.id);
    console.log('Seed: admin already exists — skipping demo org/workspace. Plans + roles updated.');
    return;
  }

  const user = await prisma.user.create({
    data: { email: 'admin@appleberry.local', passwordHash, name: 'Appleberry Admin' },
  });

  const org = await prisma.organization.create({
    data: { name: 'Appleberry Demo Org', slug: 'appleberry-demo' },
  });

  const workspace = await prisma.workspace.create({
    data: { organizationId: org.id, name: 'Main', slug: 'main' },
  });

  await prisma.membership.create({
    data: { userId: user.id, organizationId: org.id, roleId: ownerRole.id },
  });

  await prisma.workspaceMembership.create({
    data: { userId: user.id, workspaceId: workspace.id, roleId: ownerRole.id },
  });

  await prisma.whatsAppAccount.create({
    data: {
      workspaceId: workspace.id,
      name: 'Demo MOCK line',
      phone: '+10000000000',
      providerType: WhatsAppProviderType.MOCK,
      healthScore: 100,
      dailySendLimit: 1000,
    },
  });

  const proPlan = await prisma.plan.findUniqueOrThrow({ where: { slug: 'pro' } });
  await prisma.subscription.create({
    data: { workspaceId: workspace.id, planId: proPlan.id, status: 'ACTIVE' },
  });

  await backfillSubscriptions(freePlan.id);

  console.log('Seed complete:', {
    user: user.email,
    org: org.slug,
    workspace: workspace.slug,
    plan: 'pro (for demo)',
  });
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
