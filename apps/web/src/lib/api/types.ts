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

export interface Template {
  id: string;
  name: string;
  content: string;
  type: string;
  variables: Record<string, unknown>;
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
  providerType: string;
  createdAt: string;
}

export interface InboxThread {
  id: string;
  workspaceId: string;
  contactId: string;
  whatsappAccountId: string;
  status: "OPEN" | "CLOSED";
  assignedToId: string | null;
  createdAt: string;
  updatedAt: string;
  contact: {
    id: string;
    firstName: string;
    lastName: string;
    phone: string;
  };
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
export type ChatbotNodeType = "TEXT" | "QUESTION" | "CONDITION" | "ACTION";

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
