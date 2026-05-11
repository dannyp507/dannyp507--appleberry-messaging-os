-- Make postId nullable to support "All Posts" automations
ALTER TABLE "FbCommentAutomation" ALTER COLUMN "postId" DROP NOT NULL;
