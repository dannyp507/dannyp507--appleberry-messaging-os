/** BullMQ disallows ":" in queue names; logical name remains "messages:send". */
export const MESSAGES_SEND_QUEUE = 'messages-send';

export const CONTACTS_IMPORT_QUEUE = 'contacts-import';

export const CAMPAIGN_ORCHESTRATE_QUEUE = 'campaign-orchestrate';

export const INCOMING_MESSAGES_QUEUE = 'incoming-messages';

export type IncomingMessageJob = {
  whatsappAccountId: string;
  from: string;       // phone digits or full JID (kept for contact lookup)
  remoteJid: string;  // full WhatsApp JID — use this for replies
  text: string;
  senderName?: string; // WhatsApp pushName (display name)
  externalMessageId?: string;
};

export type ButtonItem = { id: string; title: string };
export type ListRow = { id: string; title: string; description?: string };
export type ListSection = { title: string; rows: ListRow[] };

export type SendMessageJob = {
  messageLogId: string;
  to: string;
  message: string;
  workspaceId: string;
  accountId: string;
  campaignId?: string;
  campaignRecipientId?: string;
  /** When set, sends a media message; `message` becomes the caption. */
  mediaUrl?: string;
  /** When set, sends an interactive button message (up to 3 buttons). */
  buttons?: ButtonItem[];
  buttonsHeader?: string;
  buttonsFooter?: string;
  /** When set, sends an interactive list message. */
  sections?: ListSection[];
  listButtonText?: string;
  listHeader?: string;
  listFooter?: string;
};

export type ContactsImportJob = {
  workspaceId: string;
  filePath: string;
  groupId?: string;
  defaultCountry?: string;
};

export type CampaignOrchestrateJob = {
  campaignId: string;
  minDelayMs: number;
  maxDelayMs: number;
};
