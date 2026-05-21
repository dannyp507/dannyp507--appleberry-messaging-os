-- CreateTable: per-WhatsApp-account AI settings (mirrors FacebookPageAiSettings)
CREATE TABLE "WhatsAppAccountAiSettings" (
    "id"                UUID NOT NULL DEFAULT gen_random_uuid(),
    "whatsappAccountId" UUID NOT NULL,
    "aiProvider"        TEXT,
    "openaiApiKey"      TEXT,
    "openaiModel"       TEXT,
    "geminiApiKey"      TEXT,
    "geminiModel"       TEXT,
    "systemPrompt"      TEXT,
    "dmAiEnabled"       BOOLEAN NOT NULL DEFAULT false,
    "dmAiFallbackOnly"  BOOLEAN NOT NULL DEFAULT true,
    "dmWelcomeEnabled"  BOOLEAN NOT NULL DEFAULT false,
    "dmWelcomeText"     TEXT,
    "dmDefaultReply"    TEXT,
    "dmTypingEnabled"   BOOLEAN NOT NULL DEFAULT false,
    "aiOffKeyword"      TEXT,
    "aiOffReply"        TEXT,
    "aiOnKeyword"       TEXT,
    "aiOnReply"         TEXT,
    "updatedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhatsAppAccountAiSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WhatsAppAccountAiSettings_whatsappAccountId_key"
    ON "WhatsAppAccountAiSettings"("whatsappAccountId");

-- AddForeignKey
ALTER TABLE "WhatsAppAccountAiSettings"
    ADD CONSTRAINT "WhatsAppAccountAiSettings_whatsappAccountId_fkey"
    FOREIGN KEY ("whatsappAccountId")
    REFERENCES "WhatsAppAccount"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
