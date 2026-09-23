-- DropForeignKey
ALTER TABLE "invitation_notification" DROP CONSTRAINT "invitation_notification_membership_id_fkey";

-- AlterTable
ALTER TABLE "workspace" ALTER COLUMN "updated_at" DROP DEFAULT;

-- CreateTable
CREATE TABLE "session_join_link" (
    "id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "governance_mode" VARCHAR(16) NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'active',
    "created_by_user_id" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "max_uses" INTEGER,
    "use_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "session_join_link_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_join_attempt" (
    "id" UUID NOT NULL,
    "join_link_id" UUID NOT NULL,
    "client_request_id" UUID NOT NULL,
    "participant_id" UUID,
    "ip_hash" VARCHAR(64),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "session_join_attempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "session_join_link_session_id_idx" ON "session_join_link"("session_id");

-- CreateIndex
CREATE INDEX "session_join_link_workspace_id_idx" ON "session_join_link"("workspace_id");

-- CreateIndex
CREATE INDEX "session_join_attempt_join_link_id_created_at_idx" ON "session_join_attempt"("join_link_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "session_join_attempt_join_link_id_client_request_id_key" ON "session_join_attempt"("join_link_id", "client_request_id");

-- RenameForeignKey
ALTER TABLE "invoice_remittance_snapshot" RENAME CONSTRAINT "invoice_remittance_snapshot_invoice_fkey" TO "invoice_remittance_snapshot_organisation_id_invoice_id_fkey";

-- RenameForeignKey
ALTER TABLE "plan_entitlement" RENAME CONSTRAINT "plan_entitlement_definition_id_fkey" TO "plan_entitlement_entitlement_definition_id_fkey";

-- RenameForeignKey
ALTER TABLE "subscription_entitlement_override" RENAME CONSTRAINT "subscription_entitlement_override_definition_id_fkey" TO "subscription_entitlement_override_entitlement_definition_i_fkey";

-- AddForeignKey
ALTER TABLE "session_join_link" ADD CONSTRAINT "session_join_link_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_join_link" ADD CONSTRAINT "session_join_link_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_join_link" ADD CONSTRAINT "session_join_link_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "co_design_session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_join_link" ADD CONSTRAINT "session_join_link_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "witness_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_join_attempt" ADD CONSTRAINT "session_join_attempt_join_link_id_fkey" FOREIGN KEY ("join_link_id") REFERENCES "session_join_link"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_join_attempt" ADD CONSTRAINT "session_join_attempt_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "session_participant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "subscription_entitlement_override_definition_id_idx" RENAME TO "subscription_entitlement_override_entitlement_definition_id_idx";

-- RenameIndex
ALTER INDEX "subscription_entitlement_override_subscription_id_entitlement_d" RENAME TO "subscription_entitlement_override_subscription_id_entitleme_key";
