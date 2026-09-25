-- CreateTable
CREATE TABLE "product_feedback" (
    "id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "session_id" UUID,
    "source_participant_id" UUID,
    "product_area" VARCHAR(24) NOT NULL,
    "moment" VARCHAR(32) NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" VARCHAR(2000),
    "submitted_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_story" (
    "id" UUID NOT NULL,
    "product_feedback_id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "consent_choice" VARCHAR(16) NOT NULL,
    "organisation_attribution_consent" BOOLEAN NOT NULL DEFAULT false,
    "attributed_name" VARCHAR(200),
    "consent_given_at" TIMESTAMPTZ(6) NOT NULL,
    "consent_withdrawn_at" TIMESTAMPTZ(6),
    "role_label" VARCHAR(40) NOT NULL,
    "raw_quote" VARCHAR(2000),
    "quote" VARCHAR(1000),
    "context" VARCHAR(500),
    "organisation_label" VARCHAR(200),
    "moderation_status" VARCHAR(16) NOT NULL DEFAULT 'pending',
    "moderation_reason" VARCHAR(500),
    "moderated_by_id" UUID,
    "moderated_at" TIMESTAMPTZ(6),
    "published_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "customer_story_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "product_feedback_workspace_id_product_area_idx" ON "product_feedback"("workspace_id", "product_area");

-- CreateIndex
CREATE INDEX "product_feedback_source_participant_id_idx" ON "product_feedback"("source_participant_id");

-- CreateIndex
CREATE UNIQUE INDEX "customer_story_product_feedback_id_key" ON "customer_story"("product_feedback_id");

-- CreateIndex
CREATE INDEX "customer_story_workspace_id_moderation_status_idx" ON "customer_story"("workspace_id", "moderation_status");

-- CreateIndex
CREATE INDEX "customer_story_moderation_status_published_at_idx" ON "customer_story"("moderation_status", "published_at");

-- AddForeignKey
ALTER TABLE "product_feedback" ADD CONSTRAINT "product_feedback_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_feedback" ADD CONSTRAINT "product_feedback_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_feedback" ADD CONSTRAINT "product_feedback_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "co_design_session"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_feedback" ADD CONSTRAINT "product_feedback_source_participant_id_fkey" FOREIGN KEY ("source_participant_id") REFERENCES "session_participant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_feedback" ADD CONSTRAINT "product_feedback_submitted_by_id_fkey" FOREIGN KEY ("submitted_by_id") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_story" ADD CONSTRAINT "customer_story_product_feedback_id_fkey" FOREIGN KEY ("product_feedback_id") REFERENCES "product_feedback"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_story" ADD CONSTRAINT "customer_story_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_story" ADD CONSTRAINT "customer_story_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_story" ADD CONSTRAINT "customer_story_moderated_by_id_fkey" FOREIGN KEY ("moderated_by_id") REFERENCES "actor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

