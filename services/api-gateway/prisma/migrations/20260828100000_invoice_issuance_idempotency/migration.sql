-- #114. Durable issuance retry identity; nullable for historical/draft rows.
ALTER TABLE "invoice" ADD COLUMN "issuance_idempotency_key" UUID;
CREATE UNIQUE INDEX "invoice_organisation_id_issuance_idempotency_key_key"
  ON "invoice"("organisation_id", "issuance_idempotency_key");
