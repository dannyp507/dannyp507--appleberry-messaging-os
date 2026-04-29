import type { WaInteractive } from '../whatsapp-cloud/whatsapp-cloud.types';

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

export type SendMessageJob = {
  messageLogId: string;
  to: string;
  message: string;
  workspaceId: string;
  accountId: string;
  campaignId?: string;
  campaignRecipientId?: string;
  /** Relative URL path to a media file, e.g. '/uploads/media/abc.jpg'.
   *  When set the processor sends a media message (image/video/document/audio)
   *  instead of plain text; `message` becomes the caption. */
  mediaUrl?: string;
  /** When set, sends a WhatsApp Cloud API interactive message (buttons / list).
   *  Only works with Cloud API accounts — Baileys/Mock fall back to plain text. */
  interactive?: WaInteractive;
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
