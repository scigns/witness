-- CreateTable
CREATE TABLE "witness_user" (
    "id" UUID NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "display_name" VARCHAR(200) NOT NULL,
    "account_state" VARCHAR(24) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "witness_user_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "witness_user_email_key" ON "witness_user"("email");

-- CreateIndex
CREATE INDEX "witness_user_account_state_idx" ON "witness_user"("account_state");

-- CreateTable
CREATE TABLE "organisation_membership" (
    "id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "state" VARCHAR(24) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "organisation_membership_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organisation_membership_organisation_id_user_id_key" ON "organisation_membership"("organisation_id", "user_id");

-- CreateIndex
CREATE INDEX "organisation_membership_organisation_id_state_idx" ON "organisation_membership"("organisation_id", "state");

-- CreateIndex
CREATE INDEX "organisation_membership_user_id_idx" ON "organisation_membership"("user_id");

-- CreateTable
CREATE TABLE "workspace_membership" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "state" VARCHAR(24) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "workspace_membership_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "workspace_membership_workspace_id_user_id_key" ON "workspace_membership"("workspace_id", "user_id");

-- CreateIndex
CREATE INDEX "workspace_membership_workspace_id_state_idx" ON "workspace_membership"("workspace_id", "state");

-- CreateIndex
CREATE INDEX "workspace_membership_user_id_idx" ON "workspace_membership"("user_id");

-- AddForeignKey
ALTER TABLE "organisation_membership" ADD CONSTRAINT "organisation_membership_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organisation_membership" ADD CONSTRAINT "organisation_membership_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "witness_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_membership" ADD CONSTRAINT "workspace_membership_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_membership" ADD CONSTRAINT "workspace_membership_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "witness_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
