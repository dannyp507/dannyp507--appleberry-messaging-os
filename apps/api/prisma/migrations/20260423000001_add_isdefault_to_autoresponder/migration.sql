-- Add isDefault flag to AutoresponderRule
ALTER TABLE "AutoresponderRule" ADD COLUMN "isDefault" BOOLEAN NOT NULL DEFAULT false;
