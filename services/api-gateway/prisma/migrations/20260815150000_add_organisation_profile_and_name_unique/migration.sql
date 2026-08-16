-- Adds `profile` (starting-defaults selector — packages/domain/src/organisation.ts's
-- INSTITUTIONAL_PROFILES), defaulted to 'general' so existing organisations
-- need no backfill decision. Adds a uniqueness constraint on `name` — nothing
-- in the schema stopped two institutions from colliding under one name
-- before this; verified no existing organisation names collide prior to
-- writing this migration.
ALTER TABLE "organisation" ADD COLUMN "profile" VARCHAR(20) NOT NULL DEFAULT 'general';

CREATE UNIQUE INDEX "organisation_name_key" ON "organisation"("name");
