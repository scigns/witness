-- CreateTable
CREATE TABLE "role_assignment" (
    "id" UUID NOT NULL,
    "scope_type" VARCHAR(16) NOT NULL,
    "organisation_id" UUID,
    "workspace_id" UUID,
    "user_id" UUID NOT NULL,
    "role" VARCHAR(24) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "role_assignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "role_assignment_organisation_id_user_id_key" ON "role_assignment"("organisation_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "role_assignment_workspace_id_user_id_key" ON "role_assignment"("workspace_id", "user_id");

-- CreateIndex
CREATE INDEX "role_assignment_user_id_idx" ON "role_assignment"("user_id");

-- AddForeignKey
ALTER TABLE "role_assignment" ADD CONSTRAINT "role_assignment_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_assignment" ADD CONSTRAINT "role_assignment_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_assignment" ADD CONSTRAINT "role_assignment_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "witness_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CheckConstraint: scope_type must be 'organisation' xor 'workspace', and the
-- matching id column must be set while the other stays NULL. Prisma's schema
-- DSL cannot express this, so it is added here directly (see the model's
-- doc comment in schema.prisma).
ALTER TABLE "role_assignment" ADD CONSTRAINT "role_assignment_scope_check" CHECK (
    ("scope_type" = 'organisation' AND "organisation_id" IS NOT NULL AND "workspace_id" IS NULL)
    OR
    ("scope_type" = 'workspace' AND "workspace_id" IS NOT NULL AND "organisation_id" IS NULL)
);
