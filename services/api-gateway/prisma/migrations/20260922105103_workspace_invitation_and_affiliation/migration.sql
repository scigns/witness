-- ADR-0028: external-collaborator workspace invitation, and the affiliation
-- metadata / via_invitation_id provenance columns it creates on
-- workspace_membership and role_assignment.
--
-- Note: `prisma migrate dev` initially generated six additional statements
-- here (a DROP of `invitation_notification_membership_id_fkey`, plus three
-- constraint renames and two index renames on unrelated commercial/billing
-- tables). Those come from pre-existing drift between schema.prisma and
-- earlier migrations (constraint names auto-generated at different Prisma
-- versions) that predates this feature entirely -- confirmed by grepping
-- the migration history for each old name. They have been removed from
-- this migration deliberately, so this change stays scoped to what it
-- claims to do; that drift is a separate, tracked cleanup item (see the
-- 2026-09-22 phase's final report), not bundled in here.

-- AlterTable
ALTER TABLE "role_assignment" ADD COLUMN     "via_invitation_id" UUID;

-- AlterTable
ALTER TABLE "workspace_membership" ADD COLUMN     "affiliation_label" VARCHAR(300),
ADD COLUMN     "affiliation_type" VARCHAR(16),
ADD COLUMN     "via_invitation_id" UUID;

-- CreateTable
CREATE TABLE "workspace_invitation" (
    "id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "invited_email" VARCHAR(320) NOT NULL,
    "invited_name" VARCHAR(200),
    "inviter_id" UUID NOT NULL,
    "role" VARCHAR(24) NOT NULL,
    "affiliation_type" VARCHAR(16) NOT NULL,
    "affiliation_label" VARCHAR(300),
    "message" VARCHAR(2000),
    "status" VARCHAR(16) NOT NULL DEFAULT 'pending',
    "token_hash" VARCHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "accepted_at" TIMESTAMPTZ(6),
    "accepted_by_user_id" UUID,
    "declined_at" TIMESTAMPTZ(6),
    "revoked_at" TIMESTAMPTZ(6),
    "resend_count" INTEGER NOT NULL DEFAULT 0,
    "delivery_status" VARCHAR(16) NOT NULL DEFAULT 'pending',
    "delivery_attempts" INTEGER NOT NULL DEFAULT 0,
    "last_delivery_error" VARCHAR(500),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "workspace_invitation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "workspace_invitation_token_hash_idx" ON "workspace_invitation"("token_hash");

-- CreateIndex
CREATE INDEX "workspace_invitation_workspace_id_status_idx" ON "workspace_invitation"("workspace_id", "status");

-- CreateIndex
CREATE INDEX "workspace_invitation_organisation_id_idx" ON "workspace_invitation"("organisation_id");

-- CreateIndex
CREATE INDEX "workspace_invitation_invited_email_idx" ON "workspace_invitation"("invited_email");

-- CreateIndex
CREATE INDEX "role_assignment_via_invitation_id_idx" ON "role_assignment"("via_invitation_id");

-- CreateIndex
CREATE INDEX "workspace_membership_via_invitation_id_idx" ON "workspace_membership"("via_invitation_id");

-- AddForeignKey
ALTER TABLE "workspace_membership" ADD CONSTRAINT "workspace_membership_via_invitation_id_fkey" FOREIGN KEY ("via_invitation_id") REFERENCES "workspace_invitation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_assignment" ADD CONSTRAINT "role_assignment_via_invitation_id_fkey" FOREIGN KEY ("via_invitation_id") REFERENCES "workspace_invitation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_invitation" ADD CONSTRAINT "workspace_invitation_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_invitation" ADD CONSTRAINT "workspace_invitation_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_invitation" ADD CONSTRAINT "workspace_invitation_inviter_id_fkey" FOREIGN KEY ("inviter_id") REFERENCES "witness_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_invitation" ADD CONSTRAINT "workspace_invitation_accepted_by_user_id_fkey" FOREIGN KEY ("accepted_by_user_id") REFERENCES "witness_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
