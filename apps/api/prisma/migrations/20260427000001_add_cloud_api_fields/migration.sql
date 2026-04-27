-- Add per-account Meta WhatsApp Cloud API credential fields to WhatsAppAccount.
-- cloudPhoneNumberId: Meta's Phone Number ID used in all Cloud API calls and webhook payloads.
-- cloudAccessToken:   Long-lived system user access token for the Cloud API.
-- cloudWabaId:        WhatsApp Business Account ID (for reference / management API calls).

ALTER TABLE "WhatsAppAccount" ADD COLUMN "cloudPhoneNumberId" TEXT;
ALTER TABLE "WhatsAppAccount" ADD COLUMN "cloudAccessToken"   TEXT;
ALTER TABLE "WhatsAppAccount" ADD COLUMN "cloudWabaId"        TEXT;

-- Unique index so the inbound webhook handler can look up an account by phone_number_id.
CREATE UNIQUE INDEX "WhatsAppAccount_cloudPhoneNumberId_key"
  ON "WhatsAppAccount" ("cloudPhoneNumberId");
