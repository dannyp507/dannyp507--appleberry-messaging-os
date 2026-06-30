CREATE TABLE IF NOT EXISTS "WhatsAppFollowUpSettings" (
  "id"                UUID        NOT NULL DEFAULT gen_random_uuid(),
  "whatsappAccountId" UUID        NOT NULL,
  "seq1Enabled"       BOOLEAN     NOT NULL DEFAULT true,
  "seq1Message"       TEXT,
  "seq1DelayHours"    INTEGER     NOT NULL DEFAULT 2,
  "seq2Enabled"       BOOLEAN     NOT NULL DEFAULT true,
  "seq2Message"       TEXT,
  "seq2DelayHours"    INTEGER     NOT NULL DEFAULT 22,
  "seq3Enabled"       BOOLEAN     NOT NULL DEFAULT true,
  "seq3Message"       TEXT,
  "seq3DelayHours"    INTEGER     NOT NULL DEFAULT 24,
  "softEnabled"       BOOLEAN     NOT NULL DEFAULT true,
  "softMessage"       TEXT,
  "softDelayHours"    INTEGER     NOT NULL DEFAULT 24,
  "sendWindowStart"   INTEGER     NOT NULL DEFAULT 8,
  "sendWindowEnd"     INTEGER     NOT NULL DEFAULT 20,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "WhatsAppFollowUpSettings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "WhatsAppFollowUpSettings_whatsappAccountId_key"
  ON "WhatsAppFollowUpSettings" ("whatsappAccountId");

ALTER TABLE "WhatsAppFollowUpSettings"
  DROP CONSTRAINT IF EXISTS "WhatsAppFollowUpSettings_whatsappAccountId_fkey";

ALTER TABLE "WhatsAppFollowUpSettings"
  ADD CONSTRAINT "WhatsAppFollowUpSettings_whatsappAccountId_fkey"
  FOREIGN KEY ("whatsappAccountId")
  REFERENCES "WhatsAppAccount"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
