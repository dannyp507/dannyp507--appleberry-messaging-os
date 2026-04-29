-- CreateEnum
CREATE TYPE "DripSequenceStatus" AS ENUM ('ACTIVE', 'PAUSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "DripEnrollmentStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'CANCELLED', 'PAUSED');

-- CreateTable
CREATE TABLE "DripSequence" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "DripSequenceStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DripSequence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DripStep" (
    "id" UUID NOT NULL,
    "sequenceId" UUID NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 1,
    "delayDays" INTEGER NOT NULL DEFAULT 0,
    "delayHours" INTEGER NOT NULL DEFAULT 0,
    "message" TEXT,
    "templateId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DripStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DripEnrollment" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "contactSubscriptionId" UUID NOT NULL,
    "sequenceId" UUID NOT NULL,
    "whatsappAccountId" UUID NOT NULL,
    "status" "DripEnrollmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "nextStepOrder" INTEGER NOT NULL DEFAULT 1,
    "nextSendAt" TIMESTAMP(3),
    "enrolledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DripEnrollment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DripSequence_workspaceId_idx" ON "DripSequence"("workspaceId");
CREATE INDEX "DripSequence_workspaceId_status_idx" ON "DripSequence"("workspaceId", "status");
CREATE INDEX "DripStep_sequenceId_sortOrder_idx" ON "DripStep"("sequenceId", "sortOrder");
CREATE UNIQUE INDEX "DripEnrollment_contactSubscriptionId_sequenceId_key" ON "DripEnrollment"("contactSubscriptionId", "sequenceId");
CREATE INDEX "DripEnrollment_workspaceId_status_idx" ON "DripEnrollment"("workspaceId", "status");
CREATE INDEX "DripEnrollment_status_nextSendAt_idx" ON "DripEnrollment"("status", "nextSendAt");

-- AddForeignKey
ALTER TABLE "DripSequence" ADD CONSTRAINT "DripSequence_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DripStep" ADD CONSTRAINT "DripStep_sequenceId_fkey" FOREIGN KEY ("sequenceId") REFERENCES "DripSequence"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DripStep" ADD CONSTRAINT "DripStep_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DripEnrollment" ADD CONSTRAINT "DripEnrollment_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DripEnrollment" ADD CONSTRAINT "DripEnrollment_contactSubscriptionId_fkey" FOREIGN KEY ("contactSubscriptionId") REFERENCES "ContactSubscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DripEnrollment" ADD CONSTRAINT "DripEnrollment_sequenceId_fkey" FOREIGN KEY ("sequenceId") REFERENCES "DripSequence"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DripEnrollment" ADD CONSTRAINT "DripEnrollment_whatsappAccountId_fkey" FOREIGN KEY ("whatsappAccountId") REFERENCES "WhatsAppAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
