-- Add MESSENGER and INSTAGRAM channel types
-- (ALTER TYPE ... ADD VALUE cannot run inside a transaction)
ALTER TYPE "ChannelType" ADD VALUE IF NOT EXISTS 'MESSENGER';
ALTER TYPE "ChannelType" ADD VALUE IF NOT EXISTS 'INSTAGRAM';

-- Create FacebookPage table
CREATE TABLE "FacebookPage" (
    "id"              UUID         NOT NULL DEFAULT gen_random_uuid(),
    "workspaceId"     UUID         NOT NULL,
    "pageId"          TEXT         NOT NULL,
    "name"            TEXT         NOT NULL,
    "category"        TEXT,
    "pageAccessToken" TEXT         NOT NULL,
    "isActive"        BOOLEAN      NOT NULL DEFAULT true,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FacebookPage_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "FacebookPage"
    ADD CONSTRAINT "FacebookPage_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "FacebookPage_workspaceId_pageId_key" ON "FacebookPage"("workspaceId", "pageId");
CREATE INDEX "FacebookPage_workspaceId_idx" ON "FacebookPage"("workspaceId");
CREATE INDEX "FacebookPage_pageId_idx" ON "FacebookPage"("pageId");

-- Add facebookPageId to InboxThread
ALTER TABLE "InboxThread" ADD COLUMN "facebookPageId" UUID;

ALTER TABLE "InboxThread"
    ADD CONSTRAINT "InboxThread_facebookPageId_fkey"
    FOREIGN KEY ("facebookPageId") REFERENCES "FacebookPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
