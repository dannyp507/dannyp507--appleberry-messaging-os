# Facebook Comment Automation — VPS Deployment

## Step 1: Copy updated files to VPS
Run from local machine or via your normal deploy process (git push → pull on VPS).

## Step 2: Run the database migration

```bash
# SSH into VPS, then:
docker exec -i appleberry-api-test-postgres-1 psql -U appleberry -d appleberry << 'EOF'
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
  "dmText"         TEXT,
  "buttonLabel"    TEXT,
  "buttonUrl"      TEXT,
  "mediaUrl"       TEXT,
  "aiEnabled"      BOOLEAN      NOT NULL DEFAULT false,
  "aiSystemPrompt" TEXT,
  "replyCount"     INTEGER      NOT NULL DEFAULT 0,
  "createdAt"      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  "updatedAt"      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT "FbCommentAutomation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FbCommentAutomation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE,
  CONSTRAINT "FbCommentAutomation_facebookPageId_fkey" FOREIGN KEY ("facebookPageId") REFERENCES "FacebookPage"("id") ON DELETE CASCADE
);
CREATE INDEX "FbCommentAutomation_workspaceId_idx" ON "FbCommentAutomation"("workspaceId");
CREATE INDEX "FbCommentAutomation_facebookPageId_idx" ON "FbCommentAutomation"("facebookPageId");
CREATE INDEX "FbCommentAutomation_workspaceId_isActive_idx" ON "FbCommentAutomation"("workspaceId", "isActive");

CREATE TABLE "FbAutomationKeyword" (
  "id"           UUID        NOT NULL DEFAULT gen_random_uuid(),
  "automationId" UUID        NOT NULL,
  "keyword"      TEXT        NOT NULL,
  "matchType"    TEXT        NOT NULL DEFAULT 'CONTAINS',
  "createdAt"    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "FbAutomationKeyword_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FbAutomationKeyword_automationId_fkey" FOREIGN KEY ("automationId") REFERENCES "FbCommentAutomation"("id") ON DELETE CASCADE
);
CREATE INDEX "FbAutomationKeyword_automationId_idx" ON "FbAutomationKeyword"("automationId");

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
  CONSTRAINT "FbCommentEvent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE,
  CONSTRAINT "FbCommentEvent_facebookPageId_fkey" FOREIGN KEY ("facebookPageId") REFERENCES "FacebookPage"("id") ON DELETE CASCADE,
  CONSTRAINT "FbCommentEvent_automationId_fkey" FOREIGN KEY ("automationId") REFERENCES "FbCommentAutomation"("id") ON DELETE SET NULL
);
CREATE INDEX "FbCommentEvent_workspaceId_processedAt_idx" ON "FbCommentEvent"("workspaceId", "processedAt");
CREATE INDEX "FbCommentEvent_facebookPageId_idx" ON "FbCommentEvent"("facebookPageId");
CREATE INDEX "FbCommentEvent_automationId_idx" ON "FbCommentEvent"("automationId");

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
  CONSTRAINT "WorkspaceBrandSettings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WorkspaceBrandSettings_workspaceId_key" UNIQUE ("workspaceId"),
  CONSTRAINT "WorkspaceBrandSettings_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE
);
EOF
```

## Step 2b: If upgrading an existing deployment (dmText column)

Run this if you already ran Step 2 previously and just need the new `dmText` field:

```bash
docker exec -i appleberry-api-test-postgres-1 psql -U appleberry -d appleberry -c 'ALTER TABLE "FbCommentAutomation" ADD COLUMN IF NOT EXISTS "dmText" TEXT;'
```

## Step 3: Copy schema.prisma to VPS API container

```bash
# From the VPS, inside the project directory:
docker cp apps/api/prisma/schema.prisma appleberry-api-test-api-1:/app/prisma/schema.prisma
```

## Step 4: Regenerate Prisma client inside the API container

```bash
docker exec appleberry-api-test-api-1 npx prisma generate
```

## Step 5: Rebuild and restart API container

```bash
cd /path/to/appleberry-messaging-os
docker compose -f docker-compose.api.yml build api
docker compose -f docker-compose.api.yml up -d api
```

## Step 6: Rebuild and restart Web container

```bash
docker compose -f docker-compose.web.yml build web
docker compose -f docker-compose.web.yml up -d web
```

## Step 7: Enable 'feed' webhook field in Meta Developer Console

1. Go to developers.facebook.com → Your App → Webhooks
2. Under "Page" subscriptions, ensure **feed** is checked
3. This allows Meta to send comment events to your webhook endpoint

## Step 8: Reconnect existing Facebook Pages (optional)

Existing pages were subscribed WITHOUT the `feed` field.
To enable comment automation on them, disconnect and reconnect each page
from the Facebook Pages section in the app — this triggers re-subscription
with the updated field list (including `feed`).

## Step 9: Verify

- Visit `/fb-comment-automations` in the app → should load
- Visit `/settings/brand` → should load Brand AI Settings form
- Create a test automation, then comment the keyword on your FB post
- Check `/fb-comment-automations/{id}/events` logs for the processed event
