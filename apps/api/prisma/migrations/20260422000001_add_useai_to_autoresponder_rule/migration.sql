-- AlterTable: add useAi flag to AutoresponderRule
ALTER TABLE "AutoresponderRule" ADD COLUMN "useAi" BOOLEAN NOT NULL DEFAULT false;
