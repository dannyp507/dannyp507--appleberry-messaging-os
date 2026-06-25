-- Add follow-up sequence fields to InboxThread
ALTER TABLE "InboxThread"
  ADD COLUMN IF NOT EXISTS "followUpScheduledFor" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "followUpCount"        INTEGER NOT NULL DEFAULT 0;

-- Index so the cron query is fast
CREATE INDEX IF NOT EXISTS "InboxThread_followUpScheduledFor_idx"
  ON "InboxThread" ("followUpScheduledFor")
  WHERE "followUpScheduledFor" IS NOT NULL;
