-- AGENT FIX: Add agent-side takeover keyword columns to WhatsAppAccountAiSettings.
-- These allow the business owner to type a phrase on WhatsApp Business phone
-- to pause/resume the AI bot for a specific conversation.
ALTER TABLE "WhatsAppAccountAiSettings" ADD COLUMN IF NOT EXISTS "agentOffKeyword" TEXT;
ALTER TABLE "WhatsAppAccountAiSettings" ADD COLUMN IF NOT EXISTS "agentOnKeyword"  TEXT;
