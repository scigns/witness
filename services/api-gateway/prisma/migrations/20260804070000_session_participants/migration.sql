-- CreateTable
CREATE TABLE "session_participant" (
    "id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "linked_user_id" UUID,
    "display_name" VARCHAR(200) NOT NULL,
    "preferred_name" VARCHAR(200),
    "pronouns" VARCHAR(50),
    "affiliation" VARCHAR(300),
    "participant_type" VARCHAR(100) NOT NULL,
    "participation_mode" VARCHAR(24) NOT NULL,
    "identity_mode" VARCHAR(24) NOT NULL,
    "identity_visibility" VARCHAR(32) NOT NULL,
    "language_preference" VARCHAR(50),
    "accessibility_requirements" TEXT,
    "invitation_status" VARCHAR(16) NOT NULL,
    "attendance_status" VARCHAR(20) NOT NULL,
    "consent_status_summary" VARCHAR(24) NOT NULL DEFAULT 'not_configured',
    "facilitator_notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "withdrawn_at" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "session_participant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "session_participant_session_id_idx" ON "session_participant"("session_id");

-- CreateIndex
CREATE INDEX "session_participant_workspace_id_idx" ON "session_participant"("workspace_id");

-- CreateIndex
CREATE INDEX "session_participant_linked_user_id_idx" ON "session_participant"("linked_user_id");

-- CreateIndex: a registered user may be linked to a session as at most one
-- participant. Partial (WHERE clause) because most participants have no
-- linked user at all, and NULL <> NULL in a Postgres unique index anyway —
-- this exists to catch a duplicate *link*, not to enforce anything about
-- unlinked participants. Prisma's schema DSL cannot express a partial
-- index, so this is added here directly (see the model's doc comment in
-- schema.prisma).
CREATE UNIQUE INDEX "session_participant_session_id_linked_user_id_key" ON "session_participant"("session_id", "linked_user_id") WHERE "linked_user_id" IS NOT NULL;

-- AddForeignKey
ALTER TABLE "session_participant" ADD CONSTRAINT "session_participant_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_participant" ADD CONSTRAINT "session_participant_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_participant" ADD CONSTRAINT "session_participant_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "co_design_session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_participant" ADD CONSTRAINT "session_participant_linked_user_id_fkey" FOREIGN KEY ("linked_user_id") REFERENCES "witness_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CheckConstraint: identity_mode must be one of the three supported modes.
-- Prisma's schema DSL cannot express this, so it is added here directly (see
-- the model's doc comment in schema.prisma and
-- packages/domain/src/session-participant.ts).
ALTER TABLE "session_participant" ADD CONSTRAINT "session_participant_identity_mode_check" CHECK (
    "identity_mode" IN ('named', 'pseudonymous', 'anonymous')
);

-- CheckConstraint: an anonymous participant may never be linked to a
-- registered user account — enforced in the domain layer, and mirrored here
-- as the database's own last line of defence (same reasoning as `record`'s
-- NOT NULL provenance columns).
ALTER TABLE "session_participant" ADD CONSTRAINT "session_participant_anonymous_not_linked_check" CHECK (
    NOT ("identity_mode" = 'anonymous' AND "linked_user_id" IS NOT NULL)
);

-- CheckConstraint: invitation_status must be one of the five recognised states.
ALTER TABLE "session_participant" ADD CONSTRAINT "session_participant_invitation_status_check" CHECK (
    "invitation_status" IN ('not_invited', 'invited', 'accepted', 'declined', 'cancelled')
);

-- CheckConstraint: attendance_status must be one of the five recognised states.
ALTER TABLE "session_participant" ADD CONSTRAINT "session_participant_attendance_status_check" CHECK (
    "attendance_status" IN ('expected', 'present', 'absent', 'partially_attended', 'left_early')
);
