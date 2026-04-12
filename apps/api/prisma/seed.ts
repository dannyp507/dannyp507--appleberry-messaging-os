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
  { key: 'view_reports', description: 'View analytics and reports' },
  { key: 'manage_inbox', description: 'View and manage inbox threads' },
  { key: 'manage_chatbot', description: 'Configure chatbot flows' },
  { key: 'manage_automation', description: 'Keyword triggers and autoresponders' },
] as const;

const ROLE_DEFS = [
  { name: 'SuperAdmin', slug: 'superadmin', keys: [...PERMISSIONS.map((p) => p.key)] },
  { name: 'Owner', slug: 'owner', keys: [...PERMISSIONS.map((p) => p.key)] },
  {
    name: 'Admin',
    slug: 'admin',
    keys: [...PERMISSIONS.map((p) => p.key)],
  },
  {
    name: 'Agent',
    slug: 'agent',
    keys: [
      'manage_contacts',
      'manage_templates',
      'manage_campaigns',
      'send_messages',
      'view_reports',
      'manage_inbox',
      'manage_chatbot',
      'manage_automation',
    ],
  },
  { name: 'Viewer', slug: 'viewer', keys: ['view_reports'] },
] as const;

async function upsertPlans() {
  const free = await prisma.plan.upsert({
    where: { slug: 'free' },
    update: { name: 'Free', messagesPerMonth: 5_000 },
    create: { name: 'Free', slug: 'free', messagesPerMonth: 5_000 },
  });
  await prisma.plan.upsert({
    where: { slug: 'pro' },
    update: { name: 'Pro', messagesPerMonth: 50_000 },
    create: { name: 'Pro', slug: 'pro', messagesPerMonth: 50_000 },
  });
  await prisma.plan.upsert({
    where: { slug: 'enterprise' },
    update: { name: 'Enterprise', messagesPerMonth: -1 },
    create: {
      name: 'Enterprise',
      slug: 'enterprise',
      messagesPerMonth: -1,
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
      data: {
        workspaceId: w.id,
        planId: freePlanId,
        status: 'ACTIVE',
      },
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

  const ownerRole = await prisma.role.findUniqueOrThrow({
    where: { slug: 'owner' },
  });

  const passwordHash = await bcrypt.hash('password123', 12);

  const existing = await prisma.user.findUnique({
    where: { email: 'admin@appleberry.local' },
  });

  if (existing) {
    await backfillSubscriptions(freePlan.id);
    console.log('Seed: admin user already exists, skipping demo org/workspace.');
    return;
  }

  const user = await prisma.user.create({
    data: {
      email: 'admin@appleberry.local',
      passwordHash,
      name: 'Appleberry Admin',
    },
  });

  const org = await prisma.organization.create({
    data: {
      name: 'Appleberry Demo Org',
      slug: 'appleberry-demo',
    },
  });

  const workspace = await prisma.workspace.create({
    data: {
      organizationId: org.id,
      name: 'Main',
      slug: 'main',
    },
  });

  await prisma.membership.create({
    data: {
      userId: user.id,
      organizationId: org.id,
      roleId: ownerRole.id,
    },
  });

  await prisma.workspaceMembership.create({
    data: {
      userId: user.id,
      workspaceId: workspace.id,
      roleId: ownerRole.id,
    },
  });

  await prisma.whatsAppAccount.create({
    data: {
      workspaceId: workspace.id,
      name: 'Demo MOCK line',
      phone: '+10000000000',
      providerType: WhatsAppProviderType.MOCK,
    },
  });

  await prisma.subscription.create({
    data: {
      workspaceId: workspace.id,
      planId: freePlan.id,
      status: 'ACTIVE',
    },
  });

  await backfillSubscriptions(freePlan.id);

  console.log('Seed complete:', {
    user: user.email,
    org: org.slug,
    workspace: workspace.slug,
  });
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
