-- Instagram Account model
CREATE TABLE "InstagramAccount" (
  "id"              UUID         NOT NULL DEFAULT gen_random_uuid(),
  "workspaceId"     UUID         NOT NULL,
  "igUserId"        TEXT         NOT NULL,
  "username"        TEXT,
  "name"            TEXT         NOT NULL,
  "pageAccessToken" TEXT         NOT NULL,
  "linkedFbPageId"  TEXT,
  "isActive"        BOOLEAN      NOT NULL DEFAULT true,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "InstagramAccount_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InstagramAccount_workspaceId_igUserId_key"
  ON "InstagramAccount"("workspaceId", "igUserId");

CREATE INDEX "InstagramAccount_workspaceId_idx"
  ON "InstagramAccount"("workspaceId");

CREATE INDEX "InstagramAccount_igUserId_idx"
  ON "InstagramAccount"("igUserId");

ALTER TABLE "InstagramAccount"
  ADD CONSTRAINT "InstagramAccount_workspaceId_fkey"
  FOREIGN KEY ("workspaceId")
  REFERENCES "Workspace"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

-- Instagram Account AI Settings model
CREATE TABLE "InstagramAccountAiSettings" (
  "id"                 UUID         NOT NULL DEFAULT gen_random_uuid(),
  "instagramAccountId" UUID         NOT NULL,
  "aiProvider"         TEXT,
  "openaiApiKey"       TEXT,
  "openaiModel"        TEXT,
  "geminiApiKey"       TEXT,
  "geminiModel"        TEXT,
  "systemPrompt"       TEXT,
  "dmAiEnabled"        BOOLEAN      NOT NULL DEFAULT false,
  "dmAiFallbackOnly"   BOOLEAN      NOT NULL DEFAULT true,
  "dmWelcomeEnabled"   BOOLEAN      NOT NULL DEFAULT false,
  "dmWelcomeText"      TEXT,
  "dmDefaultReply"     TEXT,
  "dmTypingEnabled"    BOOLEAN      NOT NULL DEFAULT false,
  "aiOffKeyword"       TEXT,
  "aiOffReply"         TEXT,
  "aiOnKeyword"        TEXT,
  "aiOnReply"          TEXT,

  CONSTRAINT "InstagramAccountAiSettings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InstagramAccountAiSettings_instagramAccountId_key"
  ON "InstagramAccountAiSettings"("instagramAccountId");

ALTER TABLE "InstagramAccountAiSettings"
  ADD CONSTRAINT "InstagramAccountAiSettings_instagramAccountId_fkey"
  FOREIGN KEY ("instagramAccountId")
  REFERENCES "InstagramAccount"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

-- Add instagramAccountId to InboxThread
ALTER TABLE "InboxThread"
  ADD COLUMN "instagramAccountId" UUID;

CREATE INDEX "InboxThread_instagramAccountId_idx"
  ON "InboxThread"("instagramAccountId");

ALTER TABLE "InboxThread"
  ADD CONSTRAINT "InboxThread_instagramAccountId_fkey"
  FOREIGN KEY ("instagramAccountId")
  REFERENCES "InstagramAccount"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

-- Add instagramAccountId to AutoresponderRule
ALTER TABLE "AutoresponderRule"
  ADD COLUMN "instagramAccountId" UUID;

CREATE INDEX "AutoresponderRule_instagramAccountId_idx"
  ON "AutoresponderRule"("instagramAccountId");

ALTER TABLE "AutoresponderRule"
  ADD CONSTRAINT "AutoresponderRule_instagramAccountId_fkey"
  FOREIGN KEY ("instagramAccountId")
  REFERENCES "InstagramAccount"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;
