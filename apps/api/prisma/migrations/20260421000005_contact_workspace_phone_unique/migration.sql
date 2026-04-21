-- ContactWorkspacePhoneUnique
-- 1. Safely deduplicates contacts with the same (workspaceId, phone) by
--    keeping the oldest record and re-pointing all FK references to it.
-- 2. Adds a unique constraint to prevent future duplicates at the DB level.

DO $$
DECLARE
  grp RECORD;
  keeper_id TEXT;
BEGIN
  FOR grp IN
    SELECT "workspaceId", phone
    FROM "Contact"
    GROUP BY "workspaceId", phone
    HAVING COUNT(*) > 1
  LOOP
    -- Keep the oldest contact (lowest createdAt, tie-break on id ASC)
    SELECT id INTO keeper_id
    FROM "Contact"
    WHERE "workspaceId" = grp."workspaceId"
      AND phone = grp.phone
    ORDER BY "createdAt" ASC, id ASC
    LIMIT 1;

    -- Re-point InboxThread → keeper
    UPDATE "InboxThread"
    SET "contactId" = keeper_id
    WHERE "workspaceId" = grp."workspaceId"
      AND "contactId" IN (
        SELECT id FROM "Contact"
        WHERE "workspaceId" = grp."workspaceId"
          AND phone = grp.phone
          AND id <> keeper_id
      );

    -- Re-point CampaignRecipient → keeper
    UPDATE "CampaignRecipient"
    SET "contactId" = keeper_id
    WHERE "contactId" IN (
      SELECT id FROM "Contact"
      WHERE "workspaceId" = grp."workspaceId"
        AND phone = grp.phone
        AND id <> keeper_id
    );

    -- Re-point MessageLog → keeper (nullable FK, safe to update)
    UPDATE "MessageLog"
    SET "contactId" = keeper_id
    WHERE "contactId" IN (
      SELECT id FROM "Contact"
      WHERE "workspaceId" = grp."workspaceId"
        AND phone = grp.phone
        AND id <> keeper_id
    );

    -- Re-point ChatbotRun → keeper
    UPDATE "ChatbotRun"
    SET "contactId" = keeper_id
    WHERE "contactId" IN (
      SELECT id FROM "Contact"
      WHERE "workspaceId" = grp."workspaceId"
        AND phone = grp.phone
        AND id <> keeper_id
    );

    -- ContactGroupMember and ContactTag use ON DELETE CASCADE, but we still
    -- need to avoid unique-constraint violations before deleting duplicates.
    -- Delete group memberships on duplicates that already exist on the keeper.
    DELETE FROM "ContactGroupMember"
    WHERE "contactId" IN (
      SELECT id FROM "Contact"
      WHERE "workspaceId" = grp."workspaceId"
        AND phone = grp.phone
        AND id <> keeper_id
    )
    AND "groupId" IN (
      SELECT "groupId" FROM "ContactGroupMember" WHERE "contactId" = keeper_id
    );

    -- Re-point remaining ContactGroupMember rows → keeper
    UPDATE "ContactGroupMember"
    SET "contactId" = keeper_id
    WHERE "contactId" IN (
      SELECT id FROM "Contact"
      WHERE "workspaceId" = grp."workspaceId"
        AND phone = grp.phone
        AND id <> keeper_id
    );

    -- Re-point ContactTag rows → keeper (dedup same-tag conflicts first)
    DELETE FROM "ContactTag"
    WHERE "contactId" IN (
      SELECT id FROM "Contact"
      WHERE "workspaceId" = grp."workspaceId"
        AND phone = grp.phone
        AND id <> keeper_id
    )
    AND "tagId" IN (
      SELECT "tagId" FROM "ContactTag" WHERE "contactId" = keeper_id
    );

    UPDATE "ContactTag"
    SET "contactId" = keeper_id
    WHERE "contactId" IN (
      SELECT id FROM "Contact"
      WHERE "workspaceId" = grp."workspaceId"
        AND phone = grp.phone
        AND id <> keeper_id
    );

    -- Delete the duplicate contacts (remaining child rows cascade-deleted)
    DELETE FROM "Contact"
    WHERE "workspaceId" = grp."workspaceId"
      AND phone = grp.phone
      AND id <> keeper_id;

  END LOOP;
END $$;

-- Add the unique constraint now that duplicates are gone
ALTER TABLE "Contact"
  ADD CONSTRAINT "Contact_workspaceId_phone_key" UNIQUE ("workspaceId", phone);
