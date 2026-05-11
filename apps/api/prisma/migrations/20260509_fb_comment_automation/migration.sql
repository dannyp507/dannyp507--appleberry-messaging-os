-- ─── Facebook Comment Automation ─────────────────────────────────────────────

CREATE TYPE "FbCommentActionType" AS ENUM ('PRIVATE_REPLY', 'PUBLIC_COMMENT', 'BOTH');

CREATE TABLE "FbCommentAutomation" (
  "id"             UUID         NOT NULL DEFAULT gen_random_uuid(),
  "workspaceId"    UUID         NOT NULL,
  "facebookPageId" UUID         NOT NULL,
  "postId"         TEXT         NOT NULL,
  "postSnippet"    TEXT,
  "name"           TEXT         NOT NULL,
  "isActive"       BOOLEAN      NOT NULL DEFAULT true,
  "actionType"     "FbCommentActionType" NOT NULL DEFAULT 'PRIVATE_REPLY',
  "messageText"    TEXT         NOT NULL,
  "buttonLabel"    TEXT,
  "buttonUrl"      TEXT,
  "mediaUrl"       TEXT,
  "aiEnabled"      BOOLEAN      NOT NULL DEFAULT false,
  "aiSystemPrompt" TEXT,
  "replyCount"     INTEGER      NOT NULL DEFAULT 0,
  "createdAt"      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  "updatedAt"      TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT "FbCommentAutomation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FbCommentAutomation_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE,
  CONSTRAINT "FbCommentAutomation_facebookPageId_fkey"
    FOREIGN KEY ("facebookPageId") REFERENCES "FacebookPage"("id") ON DELETE CASCADE
);

CREATE INDEX "FbCommentAutomation_workspaceId_idx"         ON "FbCommentAutomation"("workspaceId");
CREATE INDEX "FbCommentAutomation_facebookPageId_idx"      ON "FbCommentAutomation"("facebookPageId");
CREATE INDEX "FbCommentAutomation_workspaceId_isActive_idx" ON "FbCommentAutomation"("workspaceId", "isActive");

-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE "FbAutomationKeyword" (
  "id"           UUID        NOT NULL DEFAULT gen_random_uuid(),
  "automationId" UUID        NOT NULL,
  "keyword"      TEXT        NOT NULL,
  "matchType"    TEXT        NOT NULL DEFAULT 'CONTAINS',
  "createdAt"    TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "FbAutomationKeyword_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FbAutomationKeyword_automationId_fkey"
    FOREIGN KEY ("automationId") REFERENCES "FbCommentAutomation"("id") ON DELETE CASCADE
);

CREATE INDEX "FbAutomationKeyword_automationId_idx" ON "FbAutomationKeyword"("automationId");

-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE "FbCommentEvent" (
  "id"               UUID         NOT NULL DEFAULT gen_random_uuid(),
  "workspaceId"      UUID         NOT NULL,
  "facebookPageId"   UUID         NOT NULL,
  "automationId"     UUID,
  "commentId"        TEXT         NOT NULL,
  "postId"           TEXT         NOT NULL,
  "commenterId"      TEXT         NOT NULL,
  "commenterName"    TEXT,
  "commentText"      TEXT         NOT NULL,
  "matchedKeyword"   TEXT,
  "actionType"       "FbCommentActionType",
  "privateReplySent" BOOLEAN      NOT NULL DEFAULT false,
  "publicReplySent"  BOOLEAN      NOT NULL DEFAULT false,
  "error"            TEXT,
  "processedAt"      TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT "FbCommentEvent_pkey"      PRIMARY KEY ("id"),
  CONSTRAINT "FbCommentEvent_commentId_key" UNIQUE ("commentId"),
  CONSTRAINT "FbCommentEvent_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE,
  CONSTRAINT "FbCommentEvent_facebookPageId_fkey"
    FOREIGN KEY ("facebookPageId") REFERENCES "FacebookPage"("id") ON DELETE CASCADE,
  CONSTRAINT "FbCommentEvent_automationId_fkey"
    FOREIGN KEY ("automationId") REFERENCES "FbCommentAutomation"("id") ON DELETE SET NULL
);

CREATE INDEX "FbCommentEvent_workspaceId_processedAt_idx" ON "FbCommentEvent"("workspaceId", "processedAt");
CREATE INDEX "FbCommentEvent_facebookPageId_idx"          ON "FbCommentEvent"("facebookPageId");
CREATE INDEX "FbCommentEvent_automationId_idx"            ON "FbCommentEvent"("automationId");

-- ─── Brand AI Settings ────────────────────────────────────────────────────────

CREATE TABLE "WorkspaceBrandSettings" (
  "id"                     UUID        NOT NULL DEFAULT gen_random_uuid(),
  "workspaceId"            UUID        NOT NULL,
  "businessName"           TEXT,
  "industry"               TEXT,
  "toneOfVoice"            TEXT,
  "productsServices"       TEXT,
  "faqs"                   TEXT,
  "businessHours"          TEXT,
  "contactDetails"         TEXT,
  "websiteUrl"             TEXT,
  "wordsToUse"             TEXT,
  "wordsToAvoid"           TEXT,
  "escalationInstructions" TEXT,
  "customInstructions"     TEXT,
  "createdAt"              TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"              TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "WorkspaceBrandSettings_pkey"           PRIMARY KEY ("id"),
  CONSTRAINT "WorkspaceBrandSettings_workspaceId_key" UNIQUE ("workspaceId"),
  CONSTRAINT "WorkspaceBrandSettings_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE
);
