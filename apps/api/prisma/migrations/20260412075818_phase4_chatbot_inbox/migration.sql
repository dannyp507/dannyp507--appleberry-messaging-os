-- CreateEnum
CREATE TYPE "ChatbotFlowStatus" AS ENUM ('DRAFT', 'ACTIVE');

-- CreateEnum
CREATE TYPE "ChatbotNodeType" AS ENUM ('TEXT', 'QUESTION', 'CONDITION', 'ACTION');

-- CreateEnum
CREATE TYPE "ChatbotRunStatus" AS ENUM ('ACTIVE', 'COMPLETED');

-- CreateEnum
CREATE TYPE "KeywordMatchType" AS ENUM ('EXACT', 'CONTAINS');

-- CreateEnum
CREATE TYPE "KeywordActionType" AS ENUM ('START_FLOW', 'SEND_TEMPLATE');

-- CreateEnum
CREATE TYPE "AutoresponderMatchType" AS ENUM ('EXACT', 'CONTAINS');

-- CreateEnum
CREATE TYPE "InboxThreadStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "InboxMessageDirection" AS ENUM ('INBOUND', 'OUTBOUND');

-- CreateTable
CREATE TABLE "ChatbotFlow" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "status" "ChatbotFlowStatus" NOT NULL DEFAULT 'DRAFT',
    "entryNodeId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatbotFlow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatbotNode" (
    "id" UUID NOT NULL,
    "flowId" UUID NOT NULL,
    "type" "ChatbotNodeType" NOT NULL,
    "content" JSONB NOT NULL DEFAULT '{}',
    "position" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatbotNode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatbotEdge" (
    "id" UUID NOT NULL,
    "flowId" UUID NOT NULL,
    "fromNodeId" UUID NOT NULL,
    "toNodeId" UUID NOT NULL,
    "condition" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatbotEdge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatbotRun" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "flowId" UUID NOT NULL,
    "contactId" UUID NOT NULL,
    "currentNodeId" UUID,
    "status" "ChatbotRunStatus" NOT NULL DEFAULT 'ACTIVE',
    "variables" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatbotRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KeywordTrigger" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "keyword" TEXT NOT NULL,
    "matchType" "KeywordMatchType" NOT NULL DEFAULT 'CONTAINS',
    "actionType" "KeywordActionType" NOT NULL,
    "targetId" UUID NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KeywordTrigger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutoresponderRule" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "keyword" TEXT NOT NULL,
    "matchType" "AutoresponderMatchType" NOT NULL DEFAULT 'CONTAINS',
    "response" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutoresponderRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InboxThread" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "contactId" UUID NOT NULL,
    "whatsappAccountId" UUID NOT NULL,
    "assignedToId" UUID,
    "status" "InboxThreadStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InboxThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InboxMessage" (
    "id" UUID NOT NULL,
    "threadId" UUID NOT NULL,
    "direction" "InboxMessageDirection" NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InboxMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ChatbotFlow_entryNodeId_key" ON "ChatbotFlow"("entryNodeId");

-- CreateIndex
CREATE INDEX "ChatbotFlow_workspaceId_idx" ON "ChatbotFlow"("workspaceId");

-- CreateIndex
CREATE INDEX "ChatbotFlow_status_idx" ON "ChatbotFlow"("status");

-- CreateIndex
CREATE INDEX "ChatbotNode_flowId_idx" ON "ChatbotNode"("flowId");

-- CreateIndex
CREATE INDEX "ChatbotEdge_flowId_idx" ON "ChatbotEdge"("flowId");

-- CreateIndex
CREATE INDEX "ChatbotEdge_fromNodeId_idx" ON "ChatbotEdge"("fromNodeId");

-- CreateIndex
CREATE INDEX "ChatbotEdge_toNodeId_idx" ON "ChatbotEdge"("toNodeId");

-- CreateIndex
CREATE INDEX "ChatbotRun_workspaceId_contactId_status_idx" ON "ChatbotRun"("workspaceId", "contactId", "status");

-- CreateIndex
CREATE INDEX "ChatbotRun_flowId_idx" ON "ChatbotRun"("flowId");

-- CreateIndex
CREATE INDEX "KeywordTrigger_workspaceId_active_idx" ON "KeywordTrigger"("workspaceId", "active");

-- CreateIndex
CREATE INDEX "AutoresponderRule_workspaceId_active_priority_idx" ON "AutoresponderRule"("workspaceId", "active", "priority");

-- CreateIndex
CREATE INDEX "InboxThread_workspaceId_idx" ON "InboxThread"("workspaceId");

-- CreateIndex
CREATE INDEX "InboxThread_assignedToId_idx" ON "InboxThread"("assignedToId");

-- CreateIndex
CREATE UNIQUE INDEX "InboxThread_workspaceId_contactId_whatsappAccountId_key" ON "InboxThread"("workspaceId", "contactId", "whatsappAccountId");

-- CreateIndex
CREATE INDEX "InboxMessage_threadId_createdAt_idx" ON "InboxMessage"("threadId", "createdAt");

-- AddForeignKey
ALTER TABLE "ChatbotFlow" ADD CONSTRAINT "ChatbotFlow_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatbotFlow" ADD CONSTRAINT "ChatbotFlow_entryNodeId_fkey" FOREIGN KEY ("entryNodeId") REFERENCES "ChatbotNode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatbotNode" ADD CONSTRAINT "ChatbotNode_flowId_fkey" FOREIGN KEY ("flowId") REFERENCES "ChatbotFlow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatbotEdge" ADD CONSTRAINT "ChatbotEdge_flowId_fkey" FOREIGN KEY ("flowId") REFERENCES "ChatbotFlow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatbotEdge" ADD CONSTRAINT "ChatbotEdge_fromNodeId_fkey" FOREIGN KEY ("fromNodeId") REFERENCES "ChatbotNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatbotEdge" ADD CONSTRAINT "ChatbotEdge_toNodeId_fkey" FOREIGN KEY ("toNodeId") REFERENCES "ChatbotNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatbotRun" ADD CONSTRAINT "ChatbotRun_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatbotRun" ADD CONSTRAINT "ChatbotRun_flowId_fkey" FOREIGN KEY ("flowId") REFERENCES "ChatbotFlow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatbotRun" ADD CONSTRAINT "ChatbotRun_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatbotRun" ADD CONSTRAINT "ChatbotRun_currentNodeId_fkey" FOREIGN KEY ("currentNodeId") REFERENCES "ChatbotNode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KeywordTrigger" ADD CONSTRAINT "KeywordTrigger_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutoresponderRule" ADD CONSTRAINT "AutoresponderRule_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InboxThread" ADD CONSTRAINT "InboxThread_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InboxThread" ADD CONSTRAINT "InboxThread_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InboxThread" ADD CONSTRAINT "InboxThread_whatsappAccountId_fkey" FOREIGN KEY ("whatsappAccountId") REFERENCES "WhatsAppAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InboxThread" ADD CONSTRAINT "InboxThread_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InboxMessage" ADD CONSTRAINT "InboxMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "InboxThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;
