import type { ChannelType } from '@prisma/client';

/**
 * Shared contract for all channel send operations.
 * Each channel adapter implements this to send messages via its own API/provider.
 *
 * Phase 1: only MESSENGER is implemented via ChannelRouterService.
 * Phase 2: WhatsApp and Telegram will also expose adapters so the chatbot engine
 *          can route sends through here instead of hardcoding WA logic.
 */
export interface ChannelAdapter {
  readonly channel: ChannelType;
  sendText(recipientId: string, text: string): Promise<void>;
  sendMedia?(recipientId: string, mediaUrl: string, caption?: string): Promise<void>;
}

/**
 * Minimal context passed to ChannelRouterService.sendInboxReply().
 * Mirrors the fields we need from InboxThread without importing the Prisma type.
 */
export interface InboxReplyContext {
  threadId: string;
  workspaceId: string;            // Required for workspace-scoped DB lookups
  channel: ChannelType;
  contactPhone: string;           // E164 for WhatsApp; unused for other channels
  externalChatId: string | null;  // Messenger PSID / Telegram chatId
  whatsappAccountId: string | null;
  facebookPageId: string | null;
  telegramAccountId: string | null;
}
