-- Per-page AI settings for Facebook pages
CREATE TABLE "FacebookPageAiSettings" (
  "id"             UUID         NOT NULL DEFAULT gen_random_uuid(),
  "facebookPageId" UUID         NOT NULL,
  "aiProvider"     TEXT,
  "openaiApiKey"   TEXT,
  "openaiModel"    TEXT,
  "geminiApiKey"   TEXT,
  "geminiModel"    TEXT,
  "systemPrompt"   TEXT,
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "FacebookPageAiSettings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FacebookPageAiSettings_facebookPageId_key"
  ON "FacebookPageAiSettings"("facebookPageId");

ALTER TABLE "FacebookPageAiSettings"
  ADD CONSTRAINT "FacebookPageAiSettings_facebookPageId_fkey"
  FOREIGN KEY ("facebookPageId")
  REFERENCES "FacebookPage"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;
