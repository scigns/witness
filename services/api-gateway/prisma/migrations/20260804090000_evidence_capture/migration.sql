-- CreateTable
CREATE TABLE "evidence" (
    "id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "evidence_type" VARCHAR(100) NOT NULL,
    "title" VARCHAR(300) NOT NULL,
    "content" TEXT NOT NULL,
    "language" VARCHAR(50),
    "captured_at" TIMESTAMPTZ(6) NOT NULL,
    "session_offset_seconds" INTEGER,
    "source_participant_id" UUID,
    "attribution_mode" VARCHAR(32) NOT NULL,
    "identity_visibility" VARCHAR(32) NOT NULL,
    "consent_basis" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "review_status" VARCHAR(24) NOT NULL DEFAULT 'draft',
    "verification_status" VARCHAR(16) NOT NULL DEFAULT 'unverified',
    "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "superseded_by_evidence_id" UUID,
    "withdrawn_at" TIMESTAMPTZ(6),
    "withdrawal_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evidence_link" (
    "id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "link_type" VARCHAR(24) NOT NULL,
    "from_evidence_id" UUID NOT NULL,
    "to_evidence_id" UUID NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_id" UUID NOT NULL,

    CONSTRAINT "evidence_link_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "evidence_session_id_idx" ON "evidence"("session_id");

-- CreateIndex
CREATE INDEX "evidence_workspace_id_idx" ON "evidence"("workspace_id");

-- CreateIndex
CREATE INDEX "evidence_source_participant_id_idx" ON "evidence"("source_participant_id");

-- CreateIndex
CREATE INDEX "evidence_session_id_review_status_idx" ON "evidence"("session_id", "review_status");

-- CreateIndex: the database's own backstop against the same relationship
-- being recorded twice — EvidenceLinkService checks this first, but the
-- domain layer cannot (ADR-0003), so this is the last line of defence.
CREATE UNIQUE INDEX "evidence_link_from_evidence_id_to_evidence_id_link_type_key" ON "evidence_link"("from_evidence_id", "to_evidence_id", "link_type");

-- CreateIndex
CREATE INDEX "evidence_link_session_id_idx" ON "evidence_link"("session_id");

-- CreateIndex
CREATE INDEX "evidence_link_to_evidence_id_idx" ON "evidence_link"("to_evidence_id");

-- AddForeignKey
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "co_design_session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_source_participant_id_fkey" FOREIGN KEY ("source_participant_id") REFERENCES "session_participant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_superseded_by_evidence_id_fkey" FOREIGN KEY ("superseded_by_evidence_id") REFERENCES "evidence"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence_link" ADD CONSTRAINT "evidence_link_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence_link" ADD CONSTRAINT "evidence_link_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence_link" ADD CONSTRAINT "evidence_link_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "co_design_session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence_link" ADD CONSTRAINT "evidence_link_from_evidence_id_fkey" FOREIGN KEY ("from_evidence_id") REFERENCES "evidence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence_link" ADD CONSTRAINT "evidence_link_to_evidence_id_fkey" FOREIGN KEY ("to_evidence_id") REFERENCES "evidence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence_link" ADD CONSTRAINT "evidence_link_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CheckConstraint: review_status must be one of the seven-state vocabulary
-- (packages/domain/src/evidence.ts) — Milestone 5 only writes three of them,
-- but the column accepts the full set from the start so Milestone 6 needs
-- no migration to use the rest.
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_review_status_check" CHECK (
    "review_status" IN ('draft', 'submitted', 'under_review', 'needs_clarification', 'validated', 'rejected', 'withdrawn')
);

-- CheckConstraint: verification_status is a separate axis from
-- review_status — a claim about truth, not workflow position.
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_verification_status_check" CHECK (
    "verification_status" IN ('unverified', 'verified', 'disputed')
);

-- CheckConstraint: attribution_mode must be one of the six modes the
-- domain layer recognises.
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_attribution_mode_check" CHECK (
    "attribution_mode" IN ('attributed', 'pseudonymous', 'anonymous', 'facilitator_observation', 'institutional_source', 'unattributed')
);

-- CheckConstraint: the three sourceless attribution modes must never carry
-- a source participant, and the three participant-backed modes must always
-- carry one — the database's last line of defence for
-- assertAttributionCompatibility's structural half.
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_attribution_participant_check" CHECK (
    ("attribution_mode" IN ('facilitator_observation', 'institutional_source', 'unattributed') AND "source_participant_id" IS NULL)
    OR
    ("attribution_mode" IN ('attributed', 'pseudonymous', 'anonymous') AND "source_participant_id" IS NOT NULL)
);

-- CheckConstraint: evidence must never supersede itself.
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_superseded_not_self_check" CHECK (
    "superseded_by_evidence_id" IS NULL OR "superseded_by_evidence_id" != "id"
);

-- CheckConstraint: a session-relative timestamp cannot be negative.
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_session_offset_non_negative_check" CHECK (
    "session_offset_seconds" IS NULL OR "session_offset_seconds" >= 0
);

-- CheckConstraint: link_type must be one of the six recognised relationship
-- types (packages/domain/src/evidence-link.ts).
ALTER TABLE "evidence_link" ADD CONSTRAINT "evidence_link_link_type_check" CHECK (
    "link_type" IN ('supports', 'contradicts', 'clarifies', 'duplicates', 'follows_from', 'related_to')
);

-- CheckConstraint: evidence must never be linked to itself — the database's
-- last line of defence for the domain layer's EVIDENCE_LINK_SELF check.
ALTER TABLE "evidence_link" ADD CONSTRAINT "evidence_link_not_self_check" CHECK (
    "from_evidence_id" != "to_evidence_id"
);
