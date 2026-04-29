-- CreateEnum
CREATE TYPE "SubscriberStatus" AS ENUM ('SUBSCRIBED', 'UNSUBSCRIBED');

-- CreateTable
CREATE TABLE "ContactSubscription" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "contactId" UUID NOT NULL,
    "whatsappAccountId" UUID NOT NULL,
    "status" "SubscriberStatus" NOT NULL DEFAULT 'SUBSCRIBED',
    "subscribedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unsubscribedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContactSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ContactSubscription_contactId_whatsappAccountId_key" ON "ContactSubscription"("contactId", "whatsappAccountId");

-- CreateIndex
CREATE INDEX "ContactSubscription_workspaceId_whatsappAccountId_idx" ON "ContactSubscription"("workspaceId", "whatsappAccountId");

-- CreateIndex
CREATE INDEX "ContactSubscription_workspaceId_status_idx" ON "ContactSubscription"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "ContactSubscription_contactId_idx" ON "ContactSubscription"("contactId");

-- AddForeignKey
ALTER TABLE "ContactSubscription" ADD CONSTRAINT "ContactSubscription_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactSubscription" ADD CONSTRAINT "ContactSubscription_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactSubscription" ADD CONSTRAINT "ContactSubscription_whatsappAccountId_fkey" FOREIGN KEY ("whatsappAccountId") REFERENCES "WhatsAppAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
