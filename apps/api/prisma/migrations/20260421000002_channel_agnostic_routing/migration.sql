-- ─── Channel-agnostic routing — Phase 1 ──────────────────────────────────────
-- Safely extends the schema to support multi-channel outbound routing.
-- All changes are backwards-compatible with existing WhatsApp data.

-- ── 1. MessageLog: make WA account optional, add channel + FB/TG FKs ──────────

ALTER TABLE "MessageLog"
  ADD COLUMN "channel"           "ChannelType" NOT NULL DEFAULT 'WHATSAPP',
  ADD COLUMN "facebookPageId"    UUID,
  ADD COLUMN "telegramAccountId" UUID;

-- Make whatsappAccountId nullable (existing rows keep their value)
ALTER TABLE "MessageLog" ALTER COLUMN "whatsappAccountId" DROP NOT NULL;

ALTER TABLE "MessageLog"
  ADD CONSTRAINT "MessageLog_facebookPageId_fkey"
    FOREIGN KEY ("facebookPageId") REFERENCES "FacebookPage"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "MessageLog"
  ADD CONSTRAINT "MessageLog_telegramAccountId_fkey"
    FOREIGN KEY ("telegramAccountId") REFERENCES "TelegramAccount"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "MessageLog_facebookPageId_idx" ON "MessageLog"("facebookPageId");

-- ── 2. KeywordTrigger: optional channel scope ──────────────────────────────────
-- null = all channels (current behaviour preserved)

ALTER TABLE "KeywordTrigger" ADD COLUMN "channel" "ChannelType";

-- ── 3. AutoresponderRule: optional Facebook Page scope ─────────────────────────
-- null facebookPageId + null whatsappAccountId = workspace-wide (applies to all)

ALTER TABLE "AutoresponderRule" ADD COLUMN "facebookPageId" UUID;

ALTER TABLE "AutoresponderRule"
  ADD CONSTRAINT "AutoresponderRule_facebookPageId_fkey"
    FOREIGN KEY ("facebookPageId") REFERENCES "FacebookPage"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "AutoresponderRule_facebookPageId_idx" ON "AutoresponderRule"("facebookPageId");

-- ── 4. ChatbotRun: channel context for outbound routing ───────────────────────
-- channel + channelAccountId let the engine know where to send replies

ALTER TABLE "ChatbotRun"
  ADD COLUMN "channel"          "ChannelType" NOT NULL DEFAULT 'WHATSAPP',
  ADD COLUMN "channelAccountId" TEXT;
