export type CampaignStatus =
  | "DRAFT"
  | "RUNNING"
  | "PAUSED"
  | "COMPLETED";

export interface Campaign {
  id: string;
  name: string;
  status: CampaignStatus;
  total: number;
  sent: number;
  failed: number;
  skipped: number;
  templateId: string;
  contactGroupId: string;
  whatsappAccountId: string | null;
  createdAt: string;
  updatedAt: string;
  template?: { id: string; name: string };
  contactGroup?: { id: string; name: string };
}

export interface Contact {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string | null;
  isValid: boolean;
  isDuplicate: boolean;
  createdAt: string;
  tags?: { tag: { id: string; name: string } }[];
}

export interface ContactGroup {
  id: string;
  name: string;
  createdAt: string;
  _count?: { members: number };
}

export type TemplateType = "TEXT" | "MEDIA" | "BUTTON" | "LIST";

export interface TemplateButton {
  type: "QUICK_REPLY" | "URL" | "PHONE";
  text: string;
  value?: string;
}

export interface TemplateSection {
  title: string;
  rows: Array<{ id: string; title: string; description?: string }>;
}

export interface Template {
  id: string;
  name: string;
  content: string;
  type: TemplateType;
  header?: string | null;
  footer?: string | null;
  buttons?: TemplateButton[] | null;
  sections?: TemplateSection[] | null;
  variables: Record<string, unknown>;
  createdAt: string;
}

export interface AutoresponderRule {
  id: string;
  name: string | null;
  keyword: string;
  matchType: "EXACT" | "CONTAINS" | "REGEX";
  response: string;
  mediaUrl: string | null;
  priority: number;
  active: boolean;
  useAi: boolean;
  isDefault: boolean;
  whatsappAccountId: string | null;
  createdAt: string;
}

export interface KeywordTrigger {
  id: string;
  keyword: string;
  matchType: string;
  actionType: string;
  targetId: string | null;
  response: string | null;
  /** replyMessage kept for backwards compat — maps to response in the API */
  replyMessage?: string;
  active: boolean;
  priority: number;
  createdAt: string;
}

export interface CampaignReport {
  id: string;
  name: string;
  total: number;
  sent: number;
  failed: number;
  skipped: number;
  status: CampaignStatus;
  createdAt: string;
}

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  organizationId: string;
  createdAt: string;
}

export interface WhatsAppAccount {
  id: string;
  name: string;
  phone: string | null;
  providerType: "MOCK" | "CLOUD" | "BAILEYS";
  sessionStatus: "CONNECTING" | "CONNECTED" | "DISCONNECTED";
  createdAt: string;
  session?: {
    status: "CONNECTING" | "CONNECTED" | "DISCONNECTED";
    lastConnectedAt: string | null;
  } | null;
}

export interface TelegramAccount {
  id: string;
  name: string;
  botUsername: string | null;
  botId: string | null;
  isActive: boolean;
  webhookSet: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface FacebookPage {
  id: string;
  pageId: string;
  name: string;
  category: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  _count?: { inboxThreads: number };
}

export interface InboxThread {
  id: string;
  workspaceId: string;
  contactId: string;
  channel: "WHATSAPP" | "TELEGRAM" | "MESSENGER" | "INSTAGRAM";
  whatsappAccountId: string | null;
  telegramAccountId: string | null;
  facebookPageId: string | null;
  externalChatId: string | null;
  status: "OPEN" | "PENDING" | "RESOLVED" | "CLOSED";
  assignedToId: string | null;
  unreadCount: number;
  createdAt: string;
  updatedAt: string;
  contact: {
    id: string;
    firstName: string;
    lastName: string;
    phone: string;
    externalId: string | null;
  };
  /** Facebook Page info — present on MESSENGER threads. */
  fbPage?: { id: string; name: string; pageId: string } | null;
  assignedTo: {
    id: string;
    name: string | null;
    email: string;
  } | null;
  _count?: { messages: number };
  /** Latest message (for unread / preview UI). */
  messages?: Array<{
    direction: "INBOUND" | "OUTBOUND";
    message: string;
    createdAt: string;
  }>;
}

export interface InboxMessage {
  id: string;
  threadId: string;
  direction: "INBOUND" | "OUTBOUND";
  message: string;
  createdAt: string;
}

export type ChatbotFlowStatus = "DRAFT" | "ACTIVE";
export type ChatbotNodeType =
  | "TEXT"
  | "BUTTONS"
  | "LIST"
  | "QUESTION"
  | "CONDITION"
  | "ACTION"
  | "AI_REPLY"
  | "SAVE_TO_SHEET"
  | "CHECK_CALENDAR"
  | "CREATE_BOOKING"
  | "WEBHOOK";

export interface ChatbotFlowSummary {
  id: string;
  name: string;
  status: ChatbotFlowStatus;
  entryNodeId: string | null;
  createdAt: string;
  _count?: { nodes: number; edges: number };
}

export interface ChatbotNode {
  id: string;
  flowId: string;
  type: ChatbotNodeType;
  content: Record<string, unknown>;
  position: Record<string, unknown>;
  createdAt: string;
}

export interface ChatbotEdge {
  id: string;
  flowId: string;
  fromNodeId: string;
  toNodeId: string;
  condition: Record<string, unknown> | null;
}

export interface ChatbotFlowDetail extends ChatbotFlowSummary {
  nodes: ChatbotNode[];
  edges: ChatbotEdge[];
}

export type SubscriberStatus = "SUBSCRIBED" | "UNSUBSCRIBED";

export interface ContactSubscription {
  id: string;
  workspaceId: string;
  contactId: string;
  whatsappAccountId: string;
  status: SubscriberStatus;
  subscribedAt: string;
  unsubscribedAt: string | null;
  createdAt: string;
  updatedAt: string;
  contact: {
    id: string;
    firstName: string;
    lastName: string;
    phone: string;
    email: string | null;
    tags: { tag: { id: string; name: string; color?: string | null } }[];
  };
  whatsappAccount: {
    id: string;
    name: string;
    phone: string | null;
  };
}

// ─── Drip Sequences ───────────────────────────────────────────────────────────

export type DripSequenceStatus = "ACTIVE" | "PAUSED" | "ARCHIVED";
export type DripEnrollmentStatus = "ACTIVE" | "COMPLETED" | "CANCELLED" | "PAUSED";

export interface DripStep {
  id: string;
  sequenceId: string;
  sortOrder: number;
  delayDays: number;
  delayHours: number;
  message: string | null;
  templateId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DripSequenceSummary {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
  status: DripSequenceStatus;
  createdAt: string;
  updatedAt: string;
  _count: { steps: number; enrollments: number };
}

export interface DripSequenceDetail extends DripSequenceSummary {
  steps: DripStep[];
}

export interface DripEnrollment {
  id: string;
  workspaceId: string;
  contactSubscriptionId: string;
  sequenceId: string;
  whatsappAccountId: string;
  status: DripEnrollmentStatus;
  nextStepOrder: number;
  nextSendAt: string | null;
  enrolledAt: string;
  completedAt: string | null;
  contactSubscription: {
    contact: {
      id: string;
      firstName: string;
      lastName: string;
      phone: string;
    };
  };
}

// ─── Subscribe Forms ──────────────────────────────────────────────────────────

export interface SubscribeForm {
  id: string;
  workspaceId: string;
  whatsappAccountId: string;
  sequenceId: string | null;
  slug: string;
  name: string;
  description: string | null;
  welcomeMessage: string | null;
  active: boolean;
  submissionsCount: number;
  createdAt: string;
  updatedAt: string;
  whatsappAccount: { id: string; name: string; phone: string | null };
  sequence: { id: string; name: string } | null;
}

export interface SubscribeFormPublicConfig {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  workspace: { name: string; logoUrl: string | null };
}

export interface DashboardAnalytics {
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
}

// ─── Google Integration types ────────────────────────────────────────────────

export interface GoogleSpreadsheet {
  id: string;
  name: string;
}

export interface GoogleSheetTab {
  id: number;
  title: string;
}

export interface GoogleCalendarItem {
  id: string;
  summary: string;
  primary?: boolean;
}

export interface GoogleSheetsConfig {
  id: string;
  workspaceId: string;
  sheetId: string;
  sheetName: string;
  fields: string[];
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface GoogleCalendarConfig {
  id: string;
  workspaceId: string;
  calendarId: string;
  businessEmail: string;
  slotDuration: number;
  bookingWindowDays: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface GoogleIntegrationStatus {
  connected: boolean;
  email?: string;
  hasSheets?: boolean;
  hasCalendar?: boolean;
  sheetsConfig?: GoogleSheetsConfig | null;
  calendarConfig?: GoogleCalendarConfig | null;
}
