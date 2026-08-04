-- CreateTable
CREATE TABLE "consent_template" (
    "id" UUID NOT NULL,
    "family_id" VARCHAR(64) NOT NULL,
    "organisation_id" UUID NOT NULL,
    "workspace_id" UUID,
    "name" VARCHAR(200) NOT NULL,
    "purpose" TEXT NOT NULL,
    "description" TEXT,
    "version" INTEGER NOT NULL,
    "status" VARCHAR(16) NOT NULL,
    "plain_language_summary" TEXT NOT NULL,
    "supported_languages" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "categories" JSONB NOT NULL,
    "valid_from" TIMESTAMPTZ(6),
    "valid_until" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "consent_template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_consent_configuration" (
    "id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "consent_template_id" UUID NOT NULL,
    "template_version" INTEGER NOT NULL,
    "required_categories" TEXT[] NOT NULL,
    "optional_categories" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "facilitator_instructions" TEXT,
    "participant_introduction" TEXT,
    "effective_date" TIMESTAMPTZ(6) NOT NULL,
    "status" VARCHAR(16) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "session_consent_configuration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "participant_consent_record" (
    "id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "participant_id" UUID NOT NULL,
    "consent_template_id" UUID NOT NULL,
    "template_version" INTEGER NOT NULL,
    "category_decisions" JSONB NOT NULL,
    "capture_method" VARCHAR(100) NOT NULL,
    "language" VARCHAR(50),
    "captured_at" TIMESTAMPTZ(6) NOT NULL,
    "expires_at" TIMESTAMPTZ(6),
    "amends_record_id" UUID,
    "superseded_by_record_id" UUID,
    "withdrawn_at" TIMESTAMPTZ(6),
    "withdrawal_reason" TEXT,
    "acknowledgement_reference" VARCHAR(300),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "participant_consent_record_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "consent_template_family_id_version_key" ON "consent_template"("family_id", "version");

-- CreateIndex
CREATE INDEX "consent_template_organisation_id_idx" ON "consent_template"("organisation_id");

-- CreateIndex
CREATE INDEX "consent_template_workspace_id_idx" ON "consent_template"("workspace_id");

-- CreateIndex: a session has at most one consent configuration at a time —
-- reconfiguring replaces the row in place rather than creating a new one
-- (see the model's doc comment in schema.prisma).
CREATE UNIQUE INDEX "session_consent_configuration_session_id_key" ON "session_consent_configuration"("session_id");

-- CreateIndex
CREATE INDEX "session_consent_configuration_organisation_id_idx" ON "session_consent_configuration"("organisation_id");

-- CreateIndex
CREATE INDEX "session_consent_configuration_workspace_id_idx" ON "session_consent_configuration"("workspace_id");

-- CreateIndex
CREATE INDEX "session_consent_configuration_consent_template_id_idx" ON "session_consent_configuration"("consent_template_id");

-- CreateIndex
CREATE INDEX "participant_consent_record_session_id_idx" ON "participant_consent_record"("session_id");

-- CreateIndex
CREATE INDEX "participant_consent_record_participant_id_idx" ON "participant_consent_record"("participant_id");

-- CreateIndex
CREATE INDEX "participant_consent_record_workspace_id_idx" ON "participant_consent_record"("workspace_id");

-- CreateIndex
CREATE INDEX "participant_consent_record_consent_template_id_idx" ON "participant_consent_record"("consent_template_id");

-- AddForeignKey
ALTER TABLE "consent_template" ADD CONSTRAINT "consent_template_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent_template" ADD CONSTRAINT "consent_template_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_consent_configuration" ADD CONSTRAINT "session_consent_configuration_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_consent_configuration" ADD CONSTRAINT "session_consent_configuration_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_consent_configuration" ADD CONSTRAINT "session_consent_configuration_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "co_design_session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_consent_configuration" ADD CONSTRAINT "session_consent_configuration_consent_template_id_fkey" FOREIGN KEY ("consent_template_id") REFERENCES "consent_template"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participant_consent_record" ADD CONSTRAINT "participant_consent_record_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participant_consent_record" ADD CONSTRAINT "participant_consent_record_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participant_consent_record" ADD CONSTRAINT "participant_consent_record_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "co_design_session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participant_consent_record" ADD CONSTRAINT "participant_consent_record_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "session_participant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participant_consent_record" ADD CONSTRAINT "participant_consent_record_consent_template_id_fkey" FOREIGN KEY ("consent_template_id") REFERENCES "consent_template"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participant_consent_record" ADD CONSTRAINT "participant_consent_record_amends_record_id_fkey" FOREIGN KEY ("amends_record_id") REFERENCES "participant_consent_record"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participant_consent_record" ADD CONSTRAINT "participant_consent_record_superseded_by_record_id_fkey" FOREIGN KEY ("superseded_by_record_id") REFERENCES "participant_consent_record"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CheckConstraint: status must be one of the template lifecycle's three
-- states. Prisma's schema DSL cannot express this, so it is added here
-- directly (see the model's doc comment in schema.prisma and
-- packages/domain/src/consent-template.ts).
ALTER TABLE "consent_template" ADD CONSTRAINT "consent_template_status_check" CHECK (
    "status" IN ('draft', 'active', 'retired')
);

-- CheckConstraint: version must be positive — versions are 1-indexed within
-- a family, never zero or negative.
ALTER TABLE "consent_template" ADD CONSTRAINT "consent_template_version_positive_check" CHECK (
    "version" > 0
);

-- CheckConstraint: status must be one of the configuration lifecycle's three
-- states (packages/domain/src/session-consent-configuration.ts).
ALTER TABLE "session_consent_configuration" ADD CONSTRAINT "session_consent_configuration_status_check" CHECK (
    "status" IN ('draft', 'active', 'retired')
);

-- CheckConstraint: a session consent configuration must require at least
-- one category — mirrors the domain layer's own
-- REQUIRED_CATEGORIES_REQUIRED invariant as the database's last line of
-- defence.
ALTER TABLE "session_consent_configuration" ADD CONSTRAINT "session_consent_configuration_required_categories_check" CHECK (
    array_length("required_categories", 1) > 0
);

-- CheckConstraint: a consent record must never reference itself as its own
-- amendment or supersession — the domain layer never constructs this, and
-- the check exists purely as a backstop against a corrupted write.
ALTER TABLE "participant_consent_record" ADD CONSTRAINT "participant_consent_record_amends_not_self_check" CHECK (
    "amends_record_id" IS NULL OR "amends_record_id" != "id"
);

ALTER TABLE "participant_consent_record" ADD CONSTRAINT "participant_consent_record_superseded_not_self_check" CHECK (
    "superseded_by_record_id" IS NULL OR "superseded_by_record_id" != "id"
);
