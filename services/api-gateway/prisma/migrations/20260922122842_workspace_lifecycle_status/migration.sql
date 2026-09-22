-- Programme lifecycle (Phase 4F, ADR-0028): status/version for optimistic
-- concurrency, updated_at for the usual audit-adjacent bookkeeping. The one
-- existing row (and any future one) starts life in 'draft' with version 1;
-- updated_at gets a one-time `now()` default purely to backfill that
-- existing row — Prisma's `@updatedAt` manages every write after this.
--
-- Note: `prisma migrate dev --create-only` also emitted an unrelated
-- DropForeignKey/RenameForeignKey/RenameIndex block reconciling
-- schema.prisma's default constraint names against ones from an earlier
-- Prisma version (pre-existing drift, confirmed against migration
-- history — the same class of noise stripped out of the
-- workspace_invitation_and_affiliation migration for the same reason).
-- Removed here to keep this migration scoped to the actual schema change.
ALTER TABLE "workspace"
  ADD COLUMN "status" VARCHAR(16) NOT NULL DEFAULT 'draft',
  ADD COLUMN "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
