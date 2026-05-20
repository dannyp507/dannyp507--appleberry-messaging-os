-- CreateEnum
CREATE TYPE "IgCommentActionType" AS ENUM ('PRIVATE_REPLY', 'PUBLIC_COMMENT', 'BOTH');

-- AlterTable: add igCommentAutomations and igCommentEvents relations to Workspace (no SQL needed — handled by FK columns on child tables)

-- AlterTable: add igCommentAutomations and igCommentEvents relations to InstagramAccount (no SQL needed — handled by FK columns on child tables)

-- CreateTable: IgCommentAutomation
CREATE TABLE "IgCommentAutomation" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "instagramAccountId" TEXT NOT NULL,
    "postId" TEXT,
    "postSnippet" TEXT,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "actionType" "IgCommentActionType" NOT NULL DEFAULT 'PRIVATE_REPLY',
    "messageText" TEXT NOT NULL,
    "dmText" TEXT,
    "mediaUrl" TEXT,
    "aiEnabled" BOOLEAN NOT NULL DEFAULT false,
    "aiSystemPrompt" TEXT,
    "replyCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IgCommentAutomation_pkey" PRIMARY KEY ("id")
);

-- CreateTable: IgAutomationKeyword
CREATE TABLE "IgAutomationKeyword" (
    "id" TEXT NOT NULL,
    "automationId" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "matchType" TEXT NOT NULL DEFAULT 'CONTAINS',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IgAutomationKeyword_pkey" PRIMARY KEY ("id")
);

-- CreateTable: IgCommentEvent
CREATE TABLE "IgCommentEvent" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "instagramAccountId" TEXT NOT NULL,
    "automationId" TEXT,
    "commentId" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "commenterId" TEXT NOT NULL,
    "commenterUsername" TEXT,
    "commentText" TEXT NOT NULL,
    "matchedKeyword" TEXT,
    "actionType" "IgCommentActionType",
    "privateReplySent" BOOLEAN NOT NULL DEFAULT false,
    "publicReplySent" BOOLEAN NOT NULL DEFAULT false,
    "error" TEXT,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IgCommentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IgCommentAutomation_workspaceId_idx" ON "IgCommentAutomation"("workspaceId");

-- CreateIndex
CREATE INDEX "IgCommentAutomation_instagramAccountId_idx" ON "IgCommentAutomation"("instagramAccountId");

-- CreateIndex
CREATE INDEX "IgCommentAutomation_workspaceId_isActive_idx" ON "IgCommentAutomation"("workspaceId", "isActive");

-- CreateIndex
CREATE INDEX "IgAutomationKeyword_automationId_idx" ON "IgAutomationKeyword"("automationId");

-- CreateIndex
CREATE UNIQUE INDEX "IgCommentEvent_commentId_key" ON "IgCommentEvent"("commentId");

-- CreateIndex
CREATE INDEX "IgCommentEvent_workspaceId_processedAt_idx" ON "IgCommentEvent"("workspaceId", "processedAt");

-- CreateIndex
CREATE INDEX "IgCommentEvent_instagramAccountId_idx" ON "IgCommentEvent"("instagramAccountId");

-- CreateIndex
CREATE INDEX "IgCommentEvent_automationId_idx" ON "IgCommentEvent"("automationId");

-- AddForeignKey
ALTER TABLE "IgCommentAutomation" ADD CONSTRAINT "IgCommentAutomation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IgCommentAutomation" ADD CONSTRAINT "IgCommentAutomation_instagramAccountId_fkey" FOREIGN KEY ("instagramAccountId") REFERENCES "InstagramAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IgAutomationKeyword" ADD CONSTRAINT "IgAutomationKeyword_automationId_fkey" FOREIGN KEY ("automationId") REFERENCES "IgCommentAutomation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IgCommentEvent" ADD CONSTRAINT "IgCommentEvent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IgCommentEvent" ADD CONSTRAINT "IgCommentEvent_instagramAccountId_fkey" FOREIGN KEY ("instagramAccountId") REFERENCES "InstagramAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IgCommentEvent" ADD CONSTRAINT "IgCommentEvent_automationId_fkey" FOREIGN KEY ("automationId") REFERENCES "IgCommentAutomation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
