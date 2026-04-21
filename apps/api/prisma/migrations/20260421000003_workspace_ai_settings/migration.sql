-- CreateTable: WorkspaceAiSettings
CREATE TABLE "WorkspaceAiSettings" (
    "id"              UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspaceId"     UUID NOT NULL,
    "defaultProvider" TEXT NOT NULL DEFAULT 'openai',
    "systemPrompt"    TEXT,
    "openaiApiKey"    TEXT,
    "openaiModel"     TEXT NOT NULL DEFAULT 'gpt-4o-mini',
    "geminiApiKey"    TEXT,
    "geminiModel"     TEXT NOT NULL DEFAULT 'gemini-1.5-flash',
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkspaceAiSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceAiSettings_workspaceId_key" ON "WorkspaceAiSettings"("workspaceId");

-- AddForeignKey
ALTER TABLE "WorkspaceAiSettings"
    ADD CONSTRAINT "WorkspaceAiSettings_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
