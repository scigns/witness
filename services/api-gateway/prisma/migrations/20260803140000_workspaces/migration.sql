-- CreateTable
CREATE TABLE "workspace" (
    "id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "organisation_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workspace_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "workspace_organisation_id_idx" ON "workspace"("organisation_id");

-- AddForeignKey
ALTER TABLE "workspace" ADD CONSTRAINT "workspace_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
