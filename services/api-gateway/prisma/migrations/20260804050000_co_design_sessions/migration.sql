-- CreateTable
CREATE TABLE "co_design_session" (
    "id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "purpose" TEXT NOT NULL,
    "description" TEXT,
    "session_type" VARCHAR(100) NOT NULL,
    "location" VARCHAR(300),
    "delivery_mode" VARCHAR(24) NOT NULL,
    "start_at" TIMESTAMPTZ(6),
    "end_at" TIMESTAMPTZ(6),
    "timezone" VARCHAR(64),
    "primary_facilitator_id" UUID NOT NULL,
    "status" VARCHAR(16) NOT NULL,
    "supported_languages" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "cultural_protocol_notes" TEXT,
    "participant_visibility" VARCHAR(32) NOT NULL,
    "consent_configuration_state" VARCHAR(24) NOT NULL DEFAULT 'not_configured',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "opened_at" TIMESTAMPTZ(6),
    "closed_at" TIMESTAMPTZ(6),
    "archived_at" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "co_design_session_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "co_design_session_organisation_id_idx" ON "co_design_session"("organisation_id");

-- CreateIndex
CREATE INDEX "co_design_session_workspace_id_status_idx" ON "co_design_session"("workspace_id", "status");

-- CreateIndex
CREATE INDEX "co_design_session_primary_facilitator_id_idx" ON "co_design_session"("primary_facilitator_id");

-- AddForeignKey
ALTER TABLE "co_design_session" ADD CONSTRAINT "co_design_session_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "co_design_session" ADD CONSTRAINT "co_design_session_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "co_design_session" ADD CONSTRAINT "co_design_session_primary_facilitator_id_fkey" FOREIGN KEY ("primary_facilitator_id") REFERENCES "witness_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CheckConstraint: status must be one of the lifecycle's five states. Prisma's
-- schema DSL cannot express this, so it is added here directly (see the
-- model's doc comment in schema.prisma and the lifecycle state machine in
-- packages/domain/src/co-design-session.ts).
ALTER TABLE "co_design_session" ADD CONSTRAINT "co_design_session_status_check" CHECK (
    "status" IN ('draft', 'scheduled', 'open', 'closed', 'archived')
);
