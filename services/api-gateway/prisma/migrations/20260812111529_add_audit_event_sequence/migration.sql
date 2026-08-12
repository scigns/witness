-- AlterTable
ALTER TABLE "audit_event" ADD COLUMN     "sequence" BIGSERIAL NOT NULL;

-- CreateIndex
CREATE INDEX "audit_event_subject_type_subject_id_sequence_idx" ON "audit_event"("subject_type", "subject_id", "sequence");
