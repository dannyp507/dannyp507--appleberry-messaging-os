-- Add whatsappAccountId to AutoresponderRule so rules can be scoped to a specific WhatsApp number
-- null = applies to all accounts in the workspace (backwards compatible)

ALTER TABLE "AutoresponderRule" ADD COLUMN "whatsappAccountId" UUID;

ALTER TABLE "AutoresponderRule"
  ADD CONSTRAINT "AutoresponderRule_whatsappAccountId_fkey"
  FOREIGN KEY ("whatsappAccountId")
  REFERENCES "WhatsAppAccount"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "AutoresponderRule_whatsappAccountId_idx" ON "AutoresponderRule"("whatsappAccountId");
