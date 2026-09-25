-- CreateTable
CREATE TABLE "agreement" (
    "id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "billing_account_id" UUID NOT NULL,
    "reference" VARCHAR(200) NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
    "term_start" TIMESTAMPTZ(6) NOT NULL,
    "term_end" TIMESTAMPTZ(6),
    "notes" VARCHAR(2000),
    "previous_agreement_id" UUID,
    "status_changed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status_reason" VARCHAR(500),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_id" UUID NOT NULL,

    CONSTRAINT "agreement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "agreement_organisation_id_status_idx" ON "agreement"("organisation_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "agreement_organisation_id_id_key" ON "agreement"("organisation_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "agreement_organisation_id_previous_agreement_id_key" ON "agreement"("organisation_id", "previous_agreement_id");

-- AddForeignKey
ALTER TABLE "agreement" ADD CONSTRAINT "agreement_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agreement" ADD CONSTRAINT "agreement_organisation_id_billing_account_id_fkey" FOREIGN KEY ("organisation_id", "billing_account_id") REFERENCES "billing_account"("organisation_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agreement" ADD CONSTRAINT "agreement_organisation_id_previous_agreement_id_fkey" FOREIGN KEY ("organisation_id", "previous_agreement_id") REFERENCES "agreement"("organisation_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agreement" ADD CONSTRAINT "agreement_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
