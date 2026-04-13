-- CreateEnum
CREATE TYPE "ChannelType" AS ENUM ('WHATSAPP', 'TELEGRAM');

-- AlterTable InboxThread
ALTER TABLE "InboxThread" 
  ADD COLUMN "channel" "ChannelType" NOT NULL DEFAULT 'WHATSAPP',
  ADD COLUMN "telegramAccountId" UUID,
  ADD COLUMN "externalChatId" TEXT,
  ALTER COLUMN "whatsappAccountId" DROP NOT NULL;

-- CreateTable TelegramAccount
CREATE TABLE "TelegramAccount" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "botToken" TEXT NOT NULL,
    "botUsername" TEXT,
    "botId" BIGINT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "webhookSet" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelegramAccount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TelegramAccount_workspaceId_idx" ON "TelegramAccount"("workspaceId");

-- CreateIndex
CREATE INDEX "InboxThread_workspaceId_channel_idx" ON "InboxThread"("workspaceId", "channel");

-- AddForeignKey
ALTER TABLE "TelegramAccount" ADD CONSTRAINT "TelegramAccount_workspaceId_fkey" 
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InboxThread" ADD CONSTRAINT "InboxThread_telegramAccountId_fkey" 
  FOREIGN KEY ("telegramAccountId") REFERENCES "TelegramAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
