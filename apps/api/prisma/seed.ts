import {
  PrismaClient,
  WhatsAppProviderType,
  ChatbotFlowStatus,
  ChatbotNodeType,
  KeywordMatchType,
  KeywordActionType,
  AutoresponderMatchType,
  AutoresponderTrigger,
  ContactSource,
} from '@prisma/client';
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
      'view_reports', 'manage_inbox', 'manage_chatbot',
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

// ─── Demo Chatbot Flow ────────────────────────────────────────────────────────
//
// Flow: "Support Welcome Flow"
//
//   [TEXT]     Welcome message
//       ↓
//   [QUESTION] Ask name        (var: name)
//       ↓
//   [TEXT]     Greeting
//       ↓
//   [QUESTION] Ask dept choice (var: choice)
//       ↓
//   [CONDITION] on 'choice'
//     ├── "1" → [TEXT] Sales reply  → [END]
//     ├── "2" → [TEXT] Support reply → [END]
//     ├── "3" → [TEXT] Billing reply → [END]
//     └── fallback → [TEXT] Invalid → [END]

async function upsertDemoFlow(workspaceId: string): Promise<string> {
  const FLOW_NAME = 'Support Welcome Flow';

  const existing = await prisma.chatbotFlow.findFirst({
    where: { workspaceId, name: FLOW_NAME },
    include: { nodes: true },
  });
  if (existing) {
    console.log(`  flow "${FLOW_NAME}" already exists (id=${existing.id})`);
    return existing.id;
  }

  // 1. Create flow (no entry node yet)
  const flow = await prisma.chatbotFlow.create({
    data: { workspaceId, name: FLOW_NAME, status: ChatbotFlowStatus.ACTIVE },
  });

  // 2. Create nodes
  const welcome = await prisma.chatbotNode.create({
    data: {
      flowId: flow.id,
      type: ChatbotNodeType.TEXT,
      label: 'Welcome',
      content: { text: 'Hello! Welcome to Appleberry Support. I am your virtual assistant.' },
      position: { x: 250, y: 0 },
    },
  });

  const askName = await prisma.chatbotNode.create({
    data: {
      flowId: flow.id,
      type: ChatbotNodeType.QUESTION,
      label: 'Ask Name',
      content: { prompt: 'What is your name?', variableKey: 'name' },
      position: { x: 250, y: 200 },
    },
  });

  const greet = await prisma.chatbotNode.create({
    data: {
      flowId: flow.id,
      type: ChatbotNodeType.TEXT,
      label: 'Greet',
      content: { text: 'Nice to meet you! How can we help you today?' },
      position: { x: 250, y: 400 },
    },
  });

  const askChoice = await prisma.chatbotNode.create({
    data: {
      flowId: flow.id,
      type: ChatbotNodeType.QUESTION,
      label: 'Ask Department',
      content: {
        prompt: 'Please reply with a number:\n1 - Sales\n2 - Support\n3 - Billing',
        variableKey: 'choice',
      },
      position: { x: 250, y: 600 },
    },
  });

  const checkChoice = await prisma.chatbotNode.create({
    data: {
      flowId: flow.id,
      type: ChatbotNodeType.CONDITION,
      label: 'Route by choice',
      content: { variableKey: 'choice' },
      position: { x: 250, y: 800 },
    },
  });

  const salesReply = await prisma.chatbotNode.create({
    data: {
      flowId: flow.id,
      type: ChatbotNodeType.TEXT,
      label: 'Sales Reply',
      content: { text: 'Our sales team will reach out to you shortly. Thank you!' },
      position: { x: 0, y: 1050 },
    },
  });

  const supportReply = await prisma.chatbotNode.create({
    data: {
      flowId: flow.id,
      type: ChatbotNodeType.TEXT,
      label: 'Support Reply',
      content: { text: 'Connecting you to a support agent now. Please describe your issue in the next message.' },
      position: { x: 250, y: 1050 },
    },
  });

  const billingReply = await prisma.chatbotNode.create({
    data: {
      flowId: flow.id,
      type: ChatbotNodeType.TEXT,
      label: 'Billing Reply',
      content: { text: 'For billing inquiries please email billing@appleberry.io or visit our website.' },
      position: { x: 500, y: 1050 },
    },
  });

  const invalidReply = await prisma.chatbotNode.create({
    data: {
      flowId: flow.id,
      type: ChatbotNodeType.TEXT,
      label: 'Invalid Choice',
      content: { text: 'Sorry, I did not understand that. Please reply with 1, 2, or 3.' },
      position: { x: 750, y: 1050 },
    },
  });

  const endNode = await prisma.chatbotNode.create({
    data: {
      flowId: flow.id,
      type: ChatbotNodeType.END,
      label: 'End',
      content: {},
      position: { x: 375, y: 1300 },
    },
  });

  // 3. Create edges
  const edgePairs: Array<[string, string, object | null]> = [
    [welcome.id,     askName.id,     null],
    [askName.id,     greet.id,       null],
    [greet.id,       askChoice.id,   null],
    [askChoice.id,   checkChoice.id, null],
    [checkChoice.id, salesReply.id,  { equals: '1' }],
    [checkChoice.id, supportReply.id, { equals: '2' }],
    [checkChoice.id, billingReply.id, { equals: '3' }],
    [checkChoice.id, invalidReply.id, null],   // fallback (no condition)
    [salesReply.id,  endNode.id,     null],
    [supportReply.id, endNode.id,    null],
    [billingReply.id, endNode.id,    null],
    [invalidReply.id, endNode.id,    null],
  ];

  for (const [fromNodeId, toNodeId, condition] of edgePairs) {
    await prisma.chatbotEdge.create({
      data: { flowId: flow.id, fromNodeId, toNodeId, condition },
    });
  }

  // 4. Set entry node on flow
  await prisma.chatbotFlow.update({
    where: { id: flow.id },
    data: { entryNodeId: welcome.id },
  });

  console.log(`  created flow "${FLOW_NAME}" (id=${flow.id})`);
  return flow.id;
}

// ─── Test Contacts ────────────────────────────────────────────────────────────

async function upsertTestContacts(workspaceId: string) {
  const contacts = [
    { firstName: 'Alice',   lastName: 'Johnson',   phone: '+27821234561', email: 'alice@test.appleberry.io' },
    { firstName: 'Bob',     lastName: 'Smith',     phone: '+27831234562', email: 'bob@test.appleberry.io' },
    { firstName: 'Carlos',  lastName: 'Rodriguez', phone: '+27841234563', email: 'carlos@test.appleberry.io' },
    { firstName: 'Diana',   lastName: 'Lee',       phone: '+15551234564', email: 'diana@test.appleberry.io' },
    { firstName: 'Emanuel', lastName: 'Wilson',    phone: '+15559876545', email: 'eman@test.appleberry.io' },
  ];

  for (const c of contacts) {
    const exists = await prisma.contact.findFirst({
      where: { workspaceId, phone: c.phone },
    });
    if (!exists) {
      await prisma.contact.create({
        data: {
          workspaceId,
          firstName: c.firstName,
          lastName: c.lastName,
          phone: c.phone,
          email: c.email,
          source: ContactSource.MANUAL,
          optIn: true,
          isValid: true,
        },
      });
      console.log(`  created contact ${c.firstName} ${c.lastName} (${c.phone})`);
    }
  }
}

// ─── Keyword Triggers ─────────────────────────────────────────────────────────

async function upsertKeywordTriggers(workspaceId: string, flowId: string) {
  const keywords = ['hello', 'hi', 'hola', 'start', 'menu'];

  for (const keyword of keywords) {
    const exists = await prisma.keywordTrigger.findFirst({
      where: { workspaceId, keyword },
    });
    if (!exists) {
      await prisma.keywordTrigger.create({
        data: {
          workspaceId,
          keyword,
          matchType: KeywordMatchType.EXACT,
          actionType: KeywordActionType.START_FLOW,
          targetId: flowId,
          priority: 10,
          active: true,
        },
      });
      console.log(`  created keyword trigger "${keyword}" → START_FLOW`);
    }
  }
}

// ─── Autoresponder Fallback ───────────────────────────────────────────────────

async function upsertAutoresponder(workspaceId: string) {
  const exists = await prisma.autoresponderRule.findFirst({
    where: { workspaceId, name: 'Default Fallback' },
  });
  if (!exists) {
    await prisma.autoresponderRule.create({
      data: {
        workspaceId,
        name: 'Default Fallback',
        keyword: '',
        matchType: AutoresponderMatchType.CONTAINS,
        trigger: AutoresponderTrigger.ANY_MESSAGE,
        response: 'Thanks for your message! Type *hello* to start our assistant or wait for an agent.',
        priority: 0,
        active: true,
      },
    });
    console.log('  created default autoresponder fallback rule');
  }
}

// ─── CLOUD WhatsApp Account (placeholder for real Meta credentials) ───────────

async function upsertCloudAccount(workspaceId: string) {
  const exists = await prisma.whatsAppAccount.findFirst({
    where: { workspaceId, providerType: WhatsAppProviderType.CLOUD },
  });
  if (!exists) {
    await prisma.whatsAppAccount.create({
      data: {
        workspaceId,
        name: 'WhatsApp Cloud (Real)',
        phone: '+10000000001',
        providerType: WhatsAppProviderType.CLOUD,
        healthScore: 100,
        dailySendLimit: 1000,
        // credentials not needed — provider reads WHATSAPP_TOKEN / WHATSAPP_PHONE_ID from env
      },
    });
    console.log('  created CLOUD WhatsApp account (set WHATSAPP_TOKEN + WHATSAPP_PHONE_ID in .env to activate)');
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
    // Still upsert test data so re-running seed keeps it fresh
    const workspace = await prisma.workspace.findFirst({
      where: { organization: { slug: 'appleberry-demo' } },
    });
    if (workspace) {
      console.log('Seed: admin exists — refreshing test data for workspace:', workspace.id);
      const flowId = await upsertDemoFlow(workspace.id);
      await upsertTestContacts(workspace.id);
      await upsertKeywordTriggers(workspace.id, flowId);
      await upsertAutoresponder(workspace.id);
      await upsertCloudAccount(workspace.id);
    } else {
      console.log('Seed: admin already exists — skipping demo org/workspace. Plans + roles updated.');
    }
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

  // MOCK account — used when WHATSAPP_PROVIDER=MOCK (safe for local dev, no real messages sent)
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

  console.log('Seed: created demo user/org/workspace');

  // ── Flow, contacts, triggers ──────────────────────────────────────────────
  const flowId = await upsertDemoFlow(workspace.id);
  await upsertTestContacts(workspace.id);
  await upsertKeywordTriggers(workspace.id, flowId);
  await upsertAutoresponder(workspace.id);
  await upsertCloudAccount(workspace.id);

  console.log('\nSeed complete:', {
    user: user.email,
    password: 'password123',
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
