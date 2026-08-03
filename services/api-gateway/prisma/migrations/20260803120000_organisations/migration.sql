-- AlterTable
-- audit_event becomes a polymorphic association (subject_type + subject_id)
-- instead of a foreign key to a single table, so the same tamper-evident chain
-- can serve more than one aggregate. Referential integrity for subject_id moves
-- to the application layer, the same way append-only itself already is.
ALTER TABLE "audit_event" DROP CONSTRAINT "audit_event_record_id_fkey";

ALTER TABLE "audit_event" RENAME COLUMN "record_id" TO "subject_id";

ALTER TABLE "audit_event" ADD COLUMN "subject_type" VARCHAR(24) NOT NULL DEFAULT 'record';

ALTER TABLE "audit_event" ALTER COLUMN "subject_type" DROP DEFAULT;

-- DropIndex
DROP INDEX "audit_event_record_id_occurred_at_idx";

-- CreateIndex
CREATE INDEX "audit_event_subject_type_subject_id_occurred_at_idx" ON "audit_event"("subject_type", "subject_id", "occurred_at");

-- CreateTable
CREATE TABLE "organisation" (
    "id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organisation_pkey" PRIMARY KEY ("id")
);
