-- Adds the column nullable, backfills existing rows to
-- DEFAULT_STORAGE_QUOTA_BYTES (packages/domain/src/organisation.ts —
-- 5 GiB), then makes it NOT NULL. A plain NOT NULL ADD COLUMN with no
-- default fails against a table that already has rows, which this one does
-- on any deployment with an organisation already bootstrapped.
ALTER TABLE "organisation" ADD COLUMN "storage_quota_bytes" BIGINT;

UPDATE "organisation" SET "storage_quota_bytes" = 5368709120 WHERE "storage_quota_bytes" IS NULL;

ALTER TABLE "organisation" ALTER COLUMN "storage_quota_bytes" SET NOT NULL;
