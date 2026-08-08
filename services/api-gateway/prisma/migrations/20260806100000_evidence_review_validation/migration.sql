-- AlterTable: reviewer's stated reason for the most recent validate/reject
-- decision (packages/domain/src/evidence.ts).
ALTER TABLE "evidence" ADD COLUMN "review_decision_reason" TEXT;

-- CreateTable
CREATE TABLE "review_assignment" (
    "id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "evidence_id" UUID NOT NULL,
    "reviewer_user_id" UUID NOT NULL,
    "assigned_by_id" UUID NOT NULL,
    "assigned_at" TIMESTAMPTZ(6) NOT NULL,
    "started_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "status" VARCHAR(16) NOT NULL,
    "reassigned_from_id" UUID,
    "close_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "review_assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clarification" (
    "id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "evidence_id" UUID NOT NULL,
    "review_assignment_id" UUID NOT NULL,
    "question" TEXT NOT NULL,
    "requested_by_id" UUID NOT NULL,
    "requested_at" TIMESTAMPTZ(6) NOT NULL,
    "response" TEXT,
    "responded_by_id" UUID,
    "responded_at" TIMESTAMPTZ(6),
    "status" VARCHAR(16) NOT NULL,
    "close_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "clarification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "review_assignment_session_id_idx" ON "review_assignment"("session_id");

-- CreateIndex
CREATE INDEX "review_assignment_evidence_id_idx" ON "review_assignment"("evidence_id");

-- CreateIndex
CREATE INDEX "review_assignment_reviewer_user_id_idx" ON "review_assignment"("reviewer_user_id");

-- CreateIndex: the database's own backstop for "one active reviewer per
-- evidence" (packages/domain/src/review-assignment.ts's file header) —
-- EvidenceReviewService checks this first, but the domain layer cannot
-- (ADR-0003; it would need a database read), so this partial unique index
-- is the last line of defence if that check is ever bypassed. Expressible
-- only in migration SQL, same convention as
-- session_participant_session_id_linked_user_id_key.
CREATE UNIQUE INDEX "review_assignment_one_active_per_evidence_key" ON "review_assignment"("evidence_id") WHERE "status" IN ('assigned', 'in_progress');

-- CreateIndex: the referencing side of the self-reference gets no index
-- automatically, and the SET NULL applied when a prior assignment is deleted
-- would otherwise scan the table.
CREATE INDEX "review_assignment_reassigned_from_id_idx" ON "review_assignment"("reassigned_from_id");

-- CreateIndex
CREATE INDEX "clarification_session_id_idx" ON "clarification"("session_id");

-- CreateIndex
CREATE INDEX "clarification_evidence_id_idx" ON "clarification"("evidence_id");

-- CreateIndex
CREATE INDEX "clarification_review_assignment_id_idx" ON "clarification"("review_assignment_id");

-- AddForeignKey
ALTER TABLE "review_assignment" ADD CONSTRAINT "review_assignment_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_assignment" ADD CONSTRAINT "review_assignment_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_assignment" ADD CONSTRAINT "review_assignment_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "co_design_session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_assignment" ADD CONSTRAINT "review_assignment_evidence_id_fkey" FOREIGN KEY ("evidence_id") REFERENCES "evidence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_assignment" ADD CONSTRAINT "review_assignment_reviewer_user_id_fkey" FOREIGN KEY ("reviewer_user_id") REFERENCES "witness_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_assignment" ADD CONSTRAINT "review_assignment_assigned_by_id_fkey" FOREIGN KEY ("assigned_by_id") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_assignment" ADD CONSTRAINT "review_assignment_reassigned_from_id_fkey" FOREIGN KEY ("reassigned_from_id") REFERENCES "review_assignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clarification" ADD CONSTRAINT "clarification_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clarification" ADD CONSTRAINT "clarification_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clarification" ADD CONSTRAINT "clarification_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "co_design_session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clarification" ADD CONSTRAINT "clarification_evidence_id_fkey" FOREIGN KEY ("evidence_id") REFERENCES "evidence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clarification" ADD CONSTRAINT "clarification_review_assignment_id_fkey" FOREIGN KEY ("review_assignment_id") REFERENCES "review_assignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clarification" ADD CONSTRAINT "clarification_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clarification" ADD CONSTRAINT "clarification_responded_by_id_fkey" FOREIGN KEY ("responded_by_id") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CheckConstraint: status must be one of the five-state review-assignment
-- vocabulary (packages/domain/src/review-assignment.ts).
ALTER TABLE "review_assignment" ADD CONSTRAINT "review_assignment_status_check" CHECK (
    "status" IN ('assigned', 'in_progress', 'completed', 'cancelled', 'reassigned')
);

-- CheckConstraint: an assignment must never claim to be reassigned from
-- itself.
ALTER TABLE "review_assignment" ADD CONSTRAINT "review_assignment_reassigned_not_self_check" CHECK (
    "reassigned_from_id" IS NULL OR "reassigned_from_id" != "id"
);

-- CheckConstraint: status must be one of the four-state clarification
-- vocabulary (packages/domain/src/clarification.ts).
ALTER TABLE "clarification" ADD CONSTRAINT "clarification_status_check" CHECK (
    "status" IN ('open', 'answered', 'withdrawn', 'closed')
);

-- CheckConstraint: review_status now accepts the full seven-state
-- vocabulary in practice (Milestone 6 adds the mutators that reach
-- under_review/needs_clarification/validated/rejected) — the CHECK
-- constraint from the evidence_capture migration already allows all seven
-- values, so no change is needed here; this comment documents that the
-- constraint added in 20260804090000_evidence_capture continues to apply
-- unchanged.
