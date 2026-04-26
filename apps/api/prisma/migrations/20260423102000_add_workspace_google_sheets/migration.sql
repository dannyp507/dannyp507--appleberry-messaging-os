CREATE TABLE "WorkspaceGoogleSheetsSettings" (
  "id" UUID NOT NULL,
  "workspaceId" UUID NOT NULL,
  "googleEmail" TEXT,
  "googleRefreshToken" TEXT,
  "spreadsheetId" TEXT,
  "sheetName" TEXT DEFAULT 'Leads',
  "appointmentSheetName" TEXT DEFAULT 'Appointments',
  "calendarId" TEXT,
  "appointmentDurationMins" INTEGER NOT NULL DEFAULT 60,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "lastExportedAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "WorkspaceGoogleSheetsSettings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WorkspaceGoogleSheetsSettings_workspaceId_key"
ON "WorkspaceGoogleSheetsSettings"("workspaceId");

ALTER TABLE "WorkspaceGoogleSheetsSettings"
ADD CONSTRAINT "WorkspaceGoogleSheetsSettings_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
