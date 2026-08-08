-- CreateTable
CREATE TABLE "decision" (
    "id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "title" VARCHAR(300) NOT NULL,
    "statement" TEXT NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'proposed',
    "proposed_by_id" UUID NOT NULL,
    "proposed_at" TIMESTAMPTZ(6) NOT NULL,
    "confirmed_by_id" UUID,
    "confirmed_at" TIMESTAMPTZ(6),
    "superseded_by_decision_id" UUID,
    "superseded_at" TIMESTAMPTZ(6),
    "reversed_at" TIMESTAMPTZ(6),
    "close_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "decision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commitment" (
    "id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "title" VARCHAR(300) NOT NULL,
    "description" TEXT NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'proposed',
    "owner_description" VARCHAR(300) NOT NULL,
    "owner_user_id" UUID,
    "due_date" TIMESTAMPTZ(6),
    "proposed_by_id" UUID NOT NULL,
    "proposed_at" TIMESTAMPTZ(6) NOT NULL,
    "activated_by_id" UUID,
    "activated_at" TIMESTAMPTZ(6),
    "fulfilled_at" TIMESTAMPTZ(6),
    "fulfilment_note" TEXT,
    "superseded_by_commitment_id" UUID,
    "closed_at" TIMESTAMPTZ(6),
    "close_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "commitment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "action_item" (
    "id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "title" VARCHAR(300) NOT NULL,
    "description" TEXT NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'open',
    "priority" VARCHAR(16) NOT NULL DEFAULT 'medium',
    "owner_description" VARCHAR(300) NOT NULL,
    "owner_user_id" UUID,
    "due_date" TIMESTAMPTZ(6),
    "percent_complete" INTEGER NOT NULL DEFAULT 0,
    "progress_note" TEXT,
    "blocked_reason" TEXT,
    "created_by_id" UUID NOT NULL,
    "started_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "closed_at" TIMESTAMPTZ(6),
    "close_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "action_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outcome_support" (
    "id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "outcome_type" VARCHAR(16) NOT NULL,
    "outcome_id" UUID NOT NULL,
    "basis" VARCHAR(32) NOT NULL,
    "evidence_id" UUID,
    "evidence_version" INTEGER,
    "evidence_verification_status" VARCHAR(16),
    "rationale" TEXT,
    "note" TEXT,
    "recorded_by_id" UUID NOT NULL,
    "recorded_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outcome_support_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "decision_session_id_idx" ON "decision"("session_id");

-- CreateIndex
CREATE INDEX "decision_workspace_id_idx" ON "decision"("workspace_id");

-- CreateIndex
CREATE INDEX "decision_session_id_status_idx" ON "decision"("session_id", "status");

-- CreateIndex: the referencing side of the self-reference gets no index
-- automatically, and the SET NULL applied when a replacement decision is
-- deleted would otherwise scan the table.
CREATE INDEX "decision_superseded_by_decision_id_idx" ON "decision"("superseded_by_decision_id");

-- CreateIndex
CREATE INDEX "commitment_session_id_idx" ON "commitment"("session_id");

-- CreateIndex
CREATE INDEX "commitment_workspace_id_idx" ON "commitment"("workspace_id");

-- CreateIndex
CREATE INDEX "commitment_session_id_status_idx" ON "commitment"("session_id", "status");

-- CreateIndex
CREATE INDEX "commitment_owner_user_id_idx" ON "commitment"("owner_user_id");

-- CreateIndex
CREATE INDEX "commitment_superseded_by_commitment_id_idx" ON "commitment"("superseded_by_commitment_id");

-- CreateIndex
CREATE INDEX "action_item_session_id_idx" ON "action_item"("session_id");

-- CreateIndex
CREATE INDEX "action_item_workspace_id_idx" ON "action_item"("workspace_id");

-- CreateIndex
CREATE INDEX "action_item_session_id_status_idx" ON "action_item"("session_id", "status");

-- CreateIndex
CREATE INDEX "action_item_owner_user_id_idx" ON "action_item"("owner_user_id");

-- CreateIndex
CREATE INDEX "outcome_support_outcome_type_outcome_id_idx" ON "outcome_support"("outcome_type", "outcome_id");

-- CreateIndex
CREATE INDEX "outcome_support_session_id_idx" ON "outcome_support"("session_id");

-- CreateIndex
CREATE INDEX "outcome_support_evidence_id_idx" ON "outcome_support"("evidence_id");

-- CreateIndex: one outcome may not count the same piece of evidence twice
-- (packages/domain/src/outcome-support.ts's file header). Synthesis rows are
-- deliberately exempt — an outcome may rest on more than one line of
-- institutional reasoning — which is why this is partial and expressible
-- only here rather than in the Prisma DSL.
CREATE UNIQUE INDEX "outcome_support_one_link_per_evidence_key" ON "outcome_support"("outcome_type", "outcome_id", "evidence_id") WHERE "evidence_id" IS NOT NULL;

-- AddForeignKey
ALTER TABLE "decision" ADD CONSTRAINT "decision_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "decision" ADD CONSTRAINT "decision_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "decision" ADD CONSTRAINT "decision_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "co_design_session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "decision" ADD CONSTRAINT "decision_proposed_by_id_fkey" FOREIGN KEY ("proposed_by_id") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "decision" ADD CONSTRAINT "decision_confirmed_by_id_fkey" FOREIGN KEY ("confirmed_by_id") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "decision" ADD CONSTRAINT "decision_superseded_by_decision_id_fkey" FOREIGN KEY ("superseded_by_decision_id") REFERENCES "decision"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commitment" ADD CONSTRAINT "commitment_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commitment" ADD CONSTRAINT "commitment_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commitment" ADD CONSTRAINT "commitment_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "co_design_session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commitment" ADD CONSTRAINT "commitment_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "witness_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commitment" ADD CONSTRAINT "commitment_proposed_by_id_fkey" FOREIGN KEY ("proposed_by_id") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commitment" ADD CONSTRAINT "commitment_activated_by_id_fkey" FOREIGN KEY ("activated_by_id") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commitment" ADD CONSTRAINT "commitment_superseded_by_commitment_id_fkey" FOREIGN KEY ("superseded_by_commitment_id") REFERENCES "commitment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "action_item" ADD CONSTRAINT "action_item_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "action_item" ADD CONSTRAINT "action_item_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "action_item" ADD CONSTRAINT "action_item_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "co_design_session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "action_item" ADD CONSTRAINT "action_item_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "witness_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "action_item" ADD CONSTRAINT "action_item_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outcome_support" ADD CONSTRAINT "outcome_support_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outcome_support" ADD CONSTRAINT "outcome_support_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outcome_support" ADD CONSTRAINT "outcome_support_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "co_design_session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: RESTRICT, not CASCADE — evidence is withdrawn rather than
-- deleted precisely so that what an outcome relied on stays readable.
ALTER TABLE "outcome_support" ADD CONSTRAINT "outcome_support_evidence_id_fkey" FOREIGN KEY ("evidence_id") REFERENCES "evidence"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outcome_support" ADD CONSTRAINT "outcome_support_recorded_by_id_fkey" FOREIGN KEY ("recorded_by_id") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CheckConstraint: status must be one of the four-state decision vocabulary
-- (packages/domain/src/decision.ts).
ALTER TABLE "decision" ADD CONSTRAINT "decision_status_check" CHECK (
    "status" IN ('proposed', 'confirmed', 'superseded', 'reversed')
);

-- CheckConstraint: a decision must never claim to supersede itself.
ALTER TABLE "decision" ADD CONSTRAINT "decision_supersedes_not_self_check" CHECK (
    "superseded_by_decision_id" IS NULL OR "superseded_by_decision_id" != "id"
);

-- CheckConstraint: a superseded decision must name what replaced it —
-- "superseded by nothing" is how a decision quietly disappears
-- (packages/domain/src/decision.ts).
ALTER TABLE "decision" ADD CONSTRAINT "decision_superseded_has_replacement_check" CHECK (
    "status" != 'superseded' OR "superseded_by_decision_id" IS NOT NULL
);

-- CheckConstraint: a reversal must state its reason — a reversal without one
-- is indistinguishable from a mistake, and the difference is exactly what a
-- reader needs.
ALTER TABLE "decision" ADD CONSTRAINT "decision_reversed_has_reason_check" CHECK (
    "status" != 'reversed' OR ("close_reason" IS NOT NULL AND length(btrim("close_reason")) > 0)
);

-- CheckConstraint: status must be one of the five-state commitment
-- vocabulary (packages/domain/src/commitment.ts).
ALTER TABLE "commitment" ADD CONSTRAINT "commitment_status_check" CHECK (
    "status" IN ('proposed', 'active', 'fulfilled', 'withdrawn', 'superseded')
);

-- CheckConstraint: a commitment must never claim to supersede itself.
ALTER TABLE "commitment" ADD CONSTRAINT "commitment_supersedes_not_self_check" CHECK (
    "superseded_by_commitment_id" IS NULL OR "superseded_by_commitment_id" != "id"
);

-- CheckConstraint: the plain-language owner is always present, whether or not
-- the owner holds a Witness account (packages/domain/src/commitment.ts).
ALTER TABLE "commitment" ADD CONSTRAINT "commitment_owner_description_present_check" CHECK (
    length(btrim("owner_description")) > 0
);

-- CheckConstraint: status must be one of the five-state action vocabulary
-- (packages/domain/src/action-item.ts).
ALTER TABLE "action_item" ADD CONSTRAINT "action_item_status_check" CHECK (
    "status" IN ('open', 'in_progress', 'blocked', 'completed', 'cancelled')
);

-- CheckConstraint: priority must be one of the four declared levels.
ALTER TABLE "action_item" ADD CONSTRAINT "action_item_priority_check" CHECK (
    "priority" IN ('low', 'medium', 'high', 'urgent')
);

-- CheckConstraint: progress is a percentage, and the domain says so too.
ALTER TABLE "action_item" ADD CONSTRAINT "action_item_percent_complete_check" CHECK (
    "percent_complete" >= 0 AND "percent_complete" <= 100
);

-- CheckConstraint: a blocked action must say what is blocking it.
ALTER TABLE "action_item" ADD CONSTRAINT "action_item_blocked_has_reason_check" CHECK (
    "status" != 'blocked' OR ("blocked_reason" IS NOT NULL AND length(btrim("blocked_reason")) > 0)
);

-- CheckConstraint: same plain-language ownership rule as commitment.
ALTER TABLE "action_item" ADD CONSTRAINT "action_item_owner_description_present_check" CHECK (
    length(btrim("owner_description")) > 0
);

-- CheckConstraint: outcome_type must name one of the three outcome
-- aggregates (packages/domain/src/outcome-support.ts).
ALTER TABLE "outcome_support" ADD CONSTRAINT "outcome_support_outcome_type_check" CHECK (
    "outcome_type" IN ('decision', 'commitment', 'action_item')
);

-- CheckConstraint: there are exactly two admissible bases, and each carries
-- its own obligations — evidence-backed support must name the evidence and
-- the version it froze; institutional synthesis must state its rationale and
-- must not pretend to rest on evidence.
ALTER TABLE "outcome_support" ADD CONSTRAINT "outcome_support_basis_check" CHECK (
    ("basis" = 'validated_evidence'
        AND "evidence_id" IS NOT NULL
        AND "evidence_version" IS NOT NULL
        AND "evidence_verification_status" IS NOT NULL)
    OR ("basis" = 'institutional_synthesis'
        AND "evidence_id" IS NULL
        AND "rationale" IS NOT NULL
        AND length(btrim("rationale")) > 0)
);
