-- CreateTable
CREATE TABLE "report" (
    "id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "title" VARCHAR(300) NOT NULL,
    "purpose" TEXT,
    "audience" VARCHAR(16) NOT NULL DEFAULT 'internal',
    "status" VARCHAR(24) NOT NULL DEFAULT 'draft',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "supersedes_report_id" UUID,
    "facilitator_synthesis" TEXT,
    "unresolved_questions" TEXT,
    "recommendations" TEXT,
    "created_by_id" UUID NOT NULL,
    "submitted_by_id" UUID,
    "submitted_at" TIMESTAMPTZ(6),
    "approved_by_id" UUID,
    "approved_at" TIMESTAMPTZ(6),
    "changes_requested_reason" TEXT,
    "published_at" TIMESTAMPTZ(6),
    "first_exported_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_source" (
    "id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "report_id" UUID NOT NULL,
    "source_type" VARCHAR(16) NOT NULL,
    "source_id" UUID NOT NULL,
    "source_version" INTEGER NOT NULL,
    "source_status" VARCHAR(24) NOT NULL,
    "included_by_id" UUID NOT NULL,
    "included_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_source_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "report_session_id_idx" ON "report"("session_id");

-- CreateIndex
CREATE INDEX "report_workspace_id_idx" ON "report"("workspace_id");

-- CreateIndex
CREATE INDEX "report_session_id_status_idx" ON "report"("session_id", "status");

-- CreateIndex: the referencing side of the self-reference gets no index
-- automatically, and the SET NULL applied when a superseded revision is
-- deleted would otherwise scan the table.
CREATE INDEX "report_supersedes_report_id_idx" ON "report"("supersedes_report_id");

-- CreateIndex: a report may cite a given record once. Citing the same
-- evidence twice is not a second source, it is a duplicated paragraph.
CREATE UNIQUE INDEX "report_source_report_id_source_type_source_id_key" ON "report_source"("report_id", "source_type", "source_id");

-- CreateIndex
CREATE INDEX "report_source_report_id_idx" ON "report_source"("report_id");

-- CreateIndex
CREATE INDEX "report_source_session_id_idx" ON "report_source"("session_id");

-- AddForeignKey
ALTER TABLE "report" ADD CONSTRAINT "report_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report" ADD CONSTRAINT "report_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report" ADD CONSTRAINT "report_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "co_design_session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report" ADD CONSTRAINT "report_supersedes_report_id_fkey" FOREIGN KEY ("supersedes_report_id") REFERENCES "report"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report" ADD CONSTRAINT "report_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report" ADD CONSTRAINT "report_submitted_by_id_fkey" FOREIGN KEY ("submitted_by_id") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report" ADD CONSTRAINT "report_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_source" ADD CONSTRAINT "report_source_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_source" ADD CONSTRAINT "report_source_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_source" ADD CONSTRAINT "report_source_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "co_design_session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_source" ADD CONSTRAINT "report_source_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "report"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_source" ADD CONSTRAINT "report_source_included_by_id_fkey" FOREIGN KEY ("included_by_id") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CheckConstraint: status must be one of the five-state report vocabulary
-- (packages/domain/src/report.ts).
ALTER TABLE "report" ADD CONSTRAINT "report_status_check" CHECK (
    "status" IN ('draft', 'under_review', 'approved', 'published_internally', 'exported')
);

-- CheckConstraint: audience selects which consent category every included
-- record must satisfy, so an unknown value is not a harmless typo.
ALTER TABLE "report" ADD CONSTRAINT "report_audience_check" CHECK (
    "audience" IN ('internal', 'external', 'public')
);

-- CheckConstraint: a report must never claim to supersede itself.
ALTER TABLE "report" ADD CONSTRAINT "report_supersedes_not_self_check" CHECK (
    "supersedes_report_id" IS NULL OR "supersedes_report_id" != "id"
);

-- CheckConstraint: revisions are 1-based, and only a revision beyond the
-- first can supersede anything.
ALTER TABLE "report" ADD CONSTRAINT "report_revision_check" CHECK (
    "revision" >= 1 AND ("supersedes_report_id" IS NULL OR "revision" > 1)
);

-- CheckConstraint: everything from `approved` onwards must name its approver
-- and the moment of approval — an approved report whose approver is unknown
-- is exactly the record this milestone exists to prevent.
ALTER TABLE "report" ADD CONSTRAINT "report_approved_has_approver_check" CHECK (
    "status" NOT IN ('approved', 'published_internally', 'exported')
    OR ("approved_by_id" IS NOT NULL AND "approved_at" IS NOT NULL)
);

-- CheckConstraint: a published report must record when it was published, and
-- an exported one when a copy first left.
ALTER TABLE "report" ADD CONSTRAINT "report_published_has_date_check" CHECK (
    "status" NOT IN ('published_internally', 'exported') OR "published_at" IS NOT NULL
);

ALTER TABLE "report" ADD CONSTRAINT "report_exported_has_date_check" CHECK (
    "status" != 'exported' OR "first_exported_at" IS NOT NULL
);

-- CheckConstraint: source_type must name one of the four record kinds a
-- report may draw on (packages/domain/src/report-source.ts).
ALTER TABLE "report_source" ADD CONSTRAINT "report_source_type_check" CHECK (
    "source_type" IN ('evidence', 'decision', 'commitment', 'action_item')
);

-- CheckConstraint: the frozen version is a real version, not a placeholder.
ALTER TABLE "report_source" ADD CONSTRAINT "report_source_version_check" CHECK (
    "source_version" >= 1
);
