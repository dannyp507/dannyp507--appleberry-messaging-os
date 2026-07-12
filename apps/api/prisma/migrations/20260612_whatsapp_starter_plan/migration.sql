-- Add hasFacebook and hasInstagram feature flags to Plan
ALTER TABLE "Plan" ADD COLUMN "hasFacebook" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Plan" ADD COLUMN "hasInstagram" BOOLEAN NOT NULL DEFAULT true;

-- Add payfastToken to Subscription for subscription management
ALTER TABLE "Subscription" ADD COLUMN "payfastToken" TEXT;
