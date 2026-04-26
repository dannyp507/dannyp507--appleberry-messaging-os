-- Make provider webhook processing idempotent per inbox thread.
-- PostgreSQL allows multiple NULL values in a unique index, so normal manual
-- outbound messages without a provider id are unaffected.
CREATE UNIQUE INDEX "InboxMessage_threadId_providerMessageId_key"
ON "InboxMessage"("threadId", "providerMessageId");

CREATE INDEX "Contact_workspaceId_externalId_idx"
ON "Contact"("workspaceId", "externalId");

CREATE UNIQUE INDEX "InboxThread_workspaceId_facebookPageId_externalChatId_key"
ON "InboxThread"("workspaceId", "facebookPageId", "externalChatId");
