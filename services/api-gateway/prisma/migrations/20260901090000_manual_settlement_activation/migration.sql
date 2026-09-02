-- Provider-neutral manual settlement and paid activation.
-- Additive linkage/idempotency only; no commercial state is changed.

ALTER TABLE "commercial_change_request"
  ADD CONSTRAINT "commercial_change_request_organisation_id_id_key"
  UNIQUE ("organisation_id", "id");

ALTER TABLE "invoice"
  ADD COLUMN "commercial_change_request_id" UUID;

ALTER TABLE "invoice"
  ADD CONSTRAINT "invoice_organisation_id_commercial_change_request_id_key"
  UNIQUE ("organisation_id", "commercial_change_request_id"),
  ADD CONSTRAINT "invoice_organisation_id_commercial_change_request_id_fkey"
  FOREIGN KEY ("organisation_id", "commercial_change_request_id")
  REFERENCES "commercial_change_request"("organisation_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "payment"
  ADD COLUMN "settlement_idempotency_key" UUID;

-- No application payment writer existed before this migration. Preserve any
-- manually inserted legacy rows with deterministic row-derived request keys.
UPDATE "payment"
SET "settlement_idempotency_key" = "id"
WHERE "settlement_idempotency_key" IS NULL;

ALTER TABLE "payment"
  ALTER COLUMN "settlement_idempotency_key" SET NOT NULL;

ALTER TABLE "payment"
  DROP CONSTRAINT "payment_organisation_id_payment_method_id_source_reference_key";

ALTER TABLE "payment"
  ADD CONSTRAINT "payment_organisation_id_method_source_reference_key"
  UNIQUE ("organisation_id", "method", "source_reference"),
  ADD CONSTRAINT "payment_organisation_id_settlement_idempotency_key_key"
  UNIQUE ("organisation_id", "settlement_idempotency_key");
