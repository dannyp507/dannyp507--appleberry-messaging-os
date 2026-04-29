-- Add per-campaign min/max delay fields for the random message interval feature
ALTER TABLE "Campaign" ADD COLUMN "minDelayMs" INTEGER NOT NULL DEFAULT 1000;
ALTER TABLE "Campaign" ADD COLUMN "maxDelayMs" INTEGER NOT NULL DEFAULT 5000;
