-- Commercial-runtime-readiness: storage quota becomes an override over a
-- live ResourceProfile default rather than a value frozen at creation, and
-- Tenant gains an honest provisioning-status field. Additive/loosening
-- only -- no data loss: every existing organisation keeps its current
-- storage_quota_bytes value exactly as an explicit override (nothing is
-- cleared to NULL by this migration).

-- AlterTable
ALTER TABLE "organisation" ALTER COLUMN "storage_quota_bytes" DROP NOT NULL;

-- AlterTable
ALTER TABLE "tenant" ADD COLUMN "provisioning_status" VARCHAR(32) NOT NULL DEFAULT 'SHARED_INFRASTRUCTURE';
