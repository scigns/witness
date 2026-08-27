-- #113 Billing Profile and Immutable Invoice Snapshots. Additive only.
-- Remittance is isolated in a restricted one-to-one table; no credentials are stored.

ALTER TABLE "invoice"
  ADD COLUMN "supplier_legal_name_snapshot" VARCHAR(200),
  ADD COLUMN "supplier_business_identifier_snapshot" VARCHAR(100),
  ADD COLUMN "supplier_address_snapshot" VARCHAR(1000),
  ADD COLUMN "supplier_billing_email_snapshot" VARCHAR(320),
  ADD COLUMN "customer_legal_name_snapshot" VARCHAR(200),
  ADD COLUMN "customer_business_identifier_snapshot" VARCHAR(100),
  ADD COLUMN "customer_address_snapshot" VARCHAR(1000),
  ADD COLUMN "customer_billing_email_snapshot" VARCHAR(320);

ALTER TABLE "invoice"
  ADD CONSTRAINT "invoice_snapshot_shape_check" CHECK (
    "status" = 'DRAFT' OR (
      "supplier_legal_name_snapshot" IS NOT NULL AND length(trim("supplier_legal_name_snapshot")) > 0 AND
      "supplier_address_snapshot" IS NOT NULL AND length(trim("supplier_address_snapshot")) > 0 AND
      "supplier_billing_email_snapshot" IS NOT NULL AND length(trim("supplier_billing_email_snapshot")) > 0 AND
      "customer_legal_name_snapshot" IS NOT NULL AND length(trim("customer_legal_name_snapshot")) > 0 AND
      "customer_address_snapshot" IS NOT NULL AND length(trim("customer_address_snapshot")) > 0
    )
  ) NOT VALID;

CREATE TABLE "invoice_remittance_snapshot" (
  "id" UUID NOT NULL,
  "organisation_id" UUID NOT NULL,
  "invoice_id" UUID NOT NULL,
  "account_name" VARCHAR(200) NOT NULL,
  "routing_identifier" VARCHAR(100) NOT NULL,
  "account_number" VARCHAR(100) NOT NULL,
  "payment_instructions" VARCHAR(1000),
  "captured_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "invoice_remittance_snapshot_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "invoice_remittance_snapshot_invoice_fkey"
    FOREIGN KEY ("organisation_id", "invoice_id")
    REFERENCES "invoice"("organisation_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "invoice_remittance_snapshot_invoice_id_key" UNIQUE ("invoice_id"),
  CONSTRAINT "invoice_remittance_snapshot_organisation_id_invoice_id_key" UNIQUE ("organisation_id", "invoice_id"),
  CONSTRAINT "invoice_remittance_snapshot_values_check" CHECK (
    length(trim("account_name")) > 0 AND
    length(trim("routing_identifier")) > 0 AND
    length(trim("account_number")) > 0 AND
    ("payment_instructions" IS NULL OR length(trim("payment_instructions")) > 0)
  )
);

CREATE OR REPLACE FUNCTION "prevent_issued_invoice_snapshot_mutation"()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'DRAFT' THEN
      RAISE EXCEPTION 'Issued invoice snapshots cannot be deleted' USING ERRCODE = 'check_violation';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.status = 'DRAFT' AND NEW.status = 'OPEN' AND NOT EXISTS (
    SELECT 1 FROM "invoice_remittance_snapshot"
    WHERE organisation_id = NEW.organisation_id AND invoice_id = NEW.id
  ) THEN
    RAISE EXCEPTION 'Issued invoices require a remittance snapshot' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.status <> 'DRAFT' AND (
    NEW.supplier_legal_name_snapshot IS DISTINCT FROM OLD.supplier_legal_name_snapshot OR
    NEW.supplier_business_identifier_snapshot IS DISTINCT FROM OLD.supplier_business_identifier_snapshot OR
    NEW.supplier_address_snapshot IS DISTINCT FROM OLD.supplier_address_snapshot OR
    NEW.supplier_billing_email_snapshot IS DISTINCT FROM OLD.supplier_billing_email_snapshot OR
    NEW.customer_legal_name_snapshot IS DISTINCT FROM OLD.customer_legal_name_snapshot OR
    NEW.customer_business_identifier_snapshot IS DISTINCT FROM OLD.customer_business_identifier_snapshot OR
    NEW.customer_address_snapshot IS DISTINCT FROM OLD.customer_address_snapshot OR
    NEW.customer_billing_email_snapshot IS DISTINCT FROM OLD.customer_billing_email_snapshot
  ) THEN
    RAISE EXCEPTION 'Issued invoice snapshots are immutable' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "invoice_snapshot_immutability"
  BEFORE UPDATE OR DELETE ON "invoice"
  FOR EACH ROW EXECUTE FUNCTION "prevent_issued_invoice_snapshot_mutation"();

CREATE OR REPLACE FUNCTION "prevent_invoice_remittance_snapshot_mutation"()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE invoice_status VARCHAR(16);
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT status INTO invoice_status FROM "invoice"
      WHERE organisation_id = NEW.organisation_id AND id = NEW.invoice_id;
    IF invoice_status IS DISTINCT FROM 'DRAFT' THEN
      RAISE EXCEPTION 'Remittance snapshots must be created while invoice is DRAFT' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' OR TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Invoice remittance snapshots are immutable' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "invoice_remittance_snapshot_immutability"
  BEFORE INSERT OR UPDATE OR DELETE ON "invoice_remittance_snapshot"
  FOR EACH ROW EXECUTE FUNCTION "prevent_invoice_remittance_snapshot_mutation"();
