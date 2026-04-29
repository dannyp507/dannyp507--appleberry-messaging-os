-- Add new chatbot node types for Google integrations
ALTER TYPE "ChatbotNodeType" ADD VALUE IF NOT EXISTS 'SAVE_TO_SHEET';
ALTER TYPE "ChatbotNodeType" ADD VALUE IF NOT EXISTS 'CHECK_CALENDAR';
ALTER TYPE "ChatbotNodeType" ADD VALUE IF NOT EXISTS 'CREATE_BOOKING';

-- GoogleIntegration: stores OAuth2 tokens per workspace
CREATE TABLE "GoogleIntegration" (
  "id"           TEXT        NOT NULL,
  "workspaceId"  UUID        NOT NULL,
  "email"        TEXT        NOT NULL,
  "accessToken"  TEXT        NOT NULL,
  "refreshToken" TEXT        NOT NULL,
  "expiry"       TIMESTAMP(3) NOT NULL,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GoogleIntegration_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "GoogleIntegration_workspaceId_key" ON "GoogleIntegration"("workspaceId");
CREATE INDEX "GoogleIntegration_workspaceId_idx" ON "GoogleIntegration"("workspaceId");
ALTER TABLE "GoogleIntegration" ADD CONSTRAINT "GoogleIntegration_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- LeadCaptureConfig: which spreadsheet to write leads into
CREATE TABLE "LeadCaptureConfig" (
  "id"          TEXT         NOT NULL,
  "workspaceId" UUID         NOT NULL,
  "sheetId"     TEXT         NOT NULL,
  "sheetName"   TEXT         NOT NULL DEFAULT 'Leads',
  "fields"      JSONB        NOT NULL DEFAULT '["firstName","lastName","phone","email","source","notes"]',
  "active"      BOOLEAN      NOT NULL DEFAULT true,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LeadCaptureConfig_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "LeadCaptureConfig_workspaceId_key" ON "LeadCaptureConfig"("workspaceId");
CREATE INDEX "LeadCaptureConfig_workspaceId_idx" ON "LeadCaptureConfig"("workspaceId");
ALTER TABLE "LeadCaptureConfig" ADD CONSTRAINT "LeadCaptureConfig_workspaceId_workspace_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- CalendarConfig: which Google Calendar to use for bookings
CREATE TABLE "CalendarConfig" (
  "id"                 TEXT         NOT NULL,
  "workspaceId"        UUID         NOT NULL,
  "calendarId"         TEXT         NOT NULL DEFAULT 'primary',
  "businessEmail"      TEXT         NOT NULL,
  "slotDuration"       INTEGER      NOT NULL DEFAULT 60,
  "bookingWindowDays"  INTEGER      NOT NULL DEFAULT 14,
  "active"             BOOLEAN      NOT NULL DEFAULT true,
  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CalendarConfig_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CalendarConfig_workspaceId_key" ON "CalendarConfig"("workspaceId");
CREATE INDEX "CalendarConfig_workspaceId_idx" ON "CalendarConfig"("workspaceId");
ALTER TABLE "CalendarConfig" ADD CONSTRAINT "CalendarConfig_workspaceId_workspace_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
