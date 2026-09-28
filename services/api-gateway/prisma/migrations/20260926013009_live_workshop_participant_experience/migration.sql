-- AlterTable
ALTER TABLE "evidence" ADD COLUMN     "source_agenda_item_id" UUID;

-- CreateTable
CREATE TABLE "participant_knowledge_response" (
    "id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "knowledge_assertion_id" UUID NOT NULL,
    "source_participant_id" UUID NOT NULL,
    "response_type" VARCHAR(24) NOT NULL,
    "comment" VARCHAR(1000),
    "submitted_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "participant_knowledge_response_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_featured_insight" (
    "id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "knowledge_assertion_id" UUID NOT NULL,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "curated_by_id" UUID NOT NULL,
    "curated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removed_by_id" UUID,
    "removed_at" TIMESTAMPTZ(6),

    CONSTRAINT "session_featured_insight_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "participant_knowledge_response_session_id_idx" ON "participant_knowledge_response"("session_id");

-- CreateIndex
CREATE INDEX "participant_knowledge_response_knowledge_assertion_id_idx" ON "participant_knowledge_response"("knowledge_assertion_id");

-- CreateIndex
CREATE INDEX "participant_knowledge_response_source_participant_id_idx" ON "participant_knowledge_response"("source_participant_id");

-- CreateIndex
CREATE INDEX "session_featured_insight_session_id_knowledge_assertion_id__idx" ON "session_featured_insight"("session_id", "knowledge_assertion_id", "removed_at");

-- CreateIndex
CREATE INDEX "session_featured_insight_session_id_idx" ON "session_featured_insight"("session_id");

-- CreateIndex
CREATE INDEX "evidence_source_agenda_item_id_idx" ON "evidence"("source_agenda_item_id");

-- AddForeignKey
ALTER TABLE "participant_knowledge_response" ADD CONSTRAINT "participant_knowledge_response_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participant_knowledge_response" ADD CONSTRAINT "participant_knowledge_response_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participant_knowledge_response" ADD CONSTRAINT "participant_knowledge_response_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "co_design_session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participant_knowledge_response" ADD CONSTRAINT "participant_knowledge_response_knowledge_assertion_id_fkey" FOREIGN KEY ("knowledge_assertion_id") REFERENCES "knowledge_assertion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participant_knowledge_response" ADD CONSTRAINT "participant_knowledge_response_source_participant_id_fkey" FOREIGN KEY ("source_participant_id") REFERENCES "session_participant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participant_knowledge_response" ADD CONSTRAINT "participant_knowledge_response_submitted_by_id_fkey" FOREIGN KEY ("submitted_by_id") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_featured_insight" ADD CONSTRAINT "session_featured_insight_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_featured_insight" ADD CONSTRAINT "session_featured_insight_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_featured_insight" ADD CONSTRAINT "session_featured_insight_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "co_design_session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_featured_insight" ADD CONSTRAINT "session_featured_insight_knowledge_assertion_id_fkey" FOREIGN KEY ("knowledge_assertion_id") REFERENCES "knowledge_assertion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_featured_insight" ADD CONSTRAINT "session_featured_insight_curated_by_id_fkey" FOREIGN KEY ("curated_by_id") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_featured_insight" ADD CONSTRAINT "session_featured_insight_removed_by_id_fkey" FOREIGN KEY ("removed_by_id") REFERENCES "actor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_source_agenda_item_id_fkey" FOREIGN KEY ("source_agenda_item_id") REFERENCES "agenda_item"("id") ON DELETE SET NULL ON UPDATE CASCADE;

