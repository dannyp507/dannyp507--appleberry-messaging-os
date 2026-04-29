-- CreateTable: SubscribeForm (public opt-in landing pages)
CREATE TABLE "SubscribeForm" (
    "id"                UUID         NOT NULL DEFAULT gen_random_uuid(),
    "workspaceId"       UUID         NOT NULL,
    "whatsappAccountId" UUID         NOT NULL,
    "sequenceId"        UUID,
    "slug"              TEXT         NOT NULL,
    "name"              TEXT         NOT NULL,
    "description"       TEXT,
    "welcomeMessage"    TEXT,
    "active"            BOOLEAN      NOT NULL DEFAULT true,
    "submissionsCount"  INTEGER      NOT NULL DEFAULT 0,
    "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubscribeForm_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SubscribeForm_slug_key" ON "SubscribeForm"("slug");
CREATE INDEX "SubscribeForm_workspaceId_idx" ON "SubscribeForm"("workspaceId");

ALTER TABLE "SubscribeForm"
    ADD CONSTRAINT "SubscribeForm_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SubscribeForm"
    ADD CONSTRAINT "SubscribeForm_whatsappAccountId_fkey"
    FOREIGN KEY ("whatsappAccountId") REFERENCES "WhatsAppAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SubscribeForm"
    ADD CONSTRAINT "SubscribeForm_sequenceId_fkey"
    FOREIGN KEY ("sequenceId") REFERENCES "DripSequence"("id") ON DELETE SET NULL ON UPDATE CASCADE;
