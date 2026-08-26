-- C3.2 #112 Commercial persistence. Additive only.
--
-- This migration stores provider-neutral commercial evidence. It does not
-- issue invoices, reconcile payments, change subscriptions, or grant access.

ALTER TABLE "billing_account"
  ADD CONSTRAINT "billing_account_organisation_id_id_key" UNIQUE ("organisation_id", "id");

CREATE TABLE "invoice_number_counter" (
  "organisation_id" UUID NOT NULL,
  "next_value" BIGINT NOT NULL DEFAULT 1,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "invoice_number_counter_pkey" PRIMARY KEY ("organisation_id"),
  CONSTRAINT "invoice_number_counter_organisation_id_fkey"
    FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "invoice_number_counter_next_value_check" CHECK ("next_value" > 0)
);

CREATE TABLE "purchase_order" (
  "id" UUID NOT NULL,
  "organisation_id" UUID NOT NULL,
  "billing_account_id" UUID NOT NULL,
  "customer_reference" VARCHAR(200) NOT NULL,
  "status" VARCHAR(16) NOT NULL DEFAULT 'DRAFT',
  "authorised_amount" BIGINT NOT NULL,
  "currency" CHAR(3) NOT NULL,
  "valid_from" TIMESTAMPTZ(6) NOT NULL,
  "valid_until" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "purchase_order_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "purchase_order_organisation_id_fkey"
    FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "purchase_order_organisation_id_billing_account_id_fkey"
    FOREIGN KEY ("organisation_id", "billing_account_id")
    REFERENCES "billing_account"("organisation_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "purchase_order_organisation_id_id_key" UNIQUE ("organisation_id", "id"),
  CONSTRAINT "purchase_order_customer_reference_check" CHECK (length(trim("customer_reference")) > 0),
  CONSTRAINT "purchase_order_status_check" CHECK ("status" IN ('DRAFT', 'AUTHORISED', 'CANCELLED')),
  CONSTRAINT "purchase_order_amount_check" CHECK ("authorised_amount" >= 0),
  CONSTRAINT "purchase_order_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$'),
  CONSTRAINT "purchase_order_dates_check" CHECK ("valid_until" IS NULL OR "valid_until" >= "valid_from")
);
CREATE INDEX "purchase_order_organisation_id_status_idx" ON "purchase_order"("organisation_id", "status");

CREATE TABLE "payment_method" (
  "id" UUID NOT NULL,
  "organisation_id" UUID NOT NULL,
  "billing_account_id" UUID NOT NULL,
  "type" VARCHAR(24) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "payment_method_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payment_method_organisation_id_fkey"
    FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "payment_method_organisation_id_billing_account_id_fkey"
    FOREIGN KEY ("organisation_id", "billing_account_id")
    REFERENCES "billing_account"("organisation_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "payment_method_organisation_id_id_key" UNIQUE ("organisation_id", "id"),
  CONSTRAINT "payment_method_type_check" CHECK ("type" IN ('MANUAL_BANK_TRANSFER'))
);

CREATE TABLE "invoice" (
  "id" UUID NOT NULL,
  "organisation_id" UUID NOT NULL,
  "billing_account_id" UUID NOT NULL,
  "status" VARCHAR(16) NOT NULL DEFAULT 'DRAFT',
  "currency" CHAR(3) NOT NULL,
  "invoice_number" VARCHAR(64),
  "customer_reference" VARCHAR(200),
  "purchase_order_id" UUID,
  "subtotal_minor" BIGINT NOT NULL,
  "tax_minor" BIGINT NOT NULL,
  "total_minor" BIGINT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  "issued_at" TIMESTAMPTZ(6),
  "due_at" TIMESTAMPTZ(6),
  "paid_at" TIMESTAMPTZ(6),
  "status_changed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "status_reason" VARCHAR(500),
  CONSTRAINT "invoice_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "invoice_organisation_id_fkey"
    FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "invoice_organisation_id_billing_account_id_fkey"
    FOREIGN KEY ("organisation_id", "billing_account_id")
    REFERENCES "billing_account"("organisation_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "invoice_organisation_id_purchase_order_id_fkey"
    FOREIGN KEY ("organisation_id", "purchase_order_id")
    REFERENCES "purchase_order"("organisation_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "invoice_organisation_id_id_key" UNIQUE ("organisation_id", "id"),
  CONSTRAINT "invoice_organisation_id_invoice_number_key" UNIQUE ("organisation_id", "invoice_number"),
  CONSTRAINT "invoice_status_check" CHECK ("status" IN ('DRAFT', 'OPEN', 'PAID', 'OVERDUE', 'VOID', 'REFUNDED')),
  CONSTRAINT "invoice_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$'),
  CONSTRAINT "invoice_amounts_check" CHECK (
    "subtotal_minor" >= 0 AND "tax_minor" >= 0 AND "total_minor" >= 0
    AND "total_minor" = "subtotal_minor" + "tax_minor"
  ),
  CONSTRAINT "invoice_customer_reference_check" CHECK (
    "customer_reference" IS NULL OR length(trim("customer_reference")) > 0
  ),
  CONSTRAINT "invoice_dates_check" CHECK ("due_at" IS NULL OR ("issued_at" IS NOT NULL AND "due_at" >= "issued_at")),
  CONSTRAINT "invoice_issued_shape_check" CHECK (
    "status" IN ('DRAFT', 'VOID') OR ("invoice_number" IS NOT NULL AND "issued_at" IS NOT NULL AND "due_at" IS NOT NULL)
  ),
  CONSTRAINT "invoice_draft_shape_check" CHECK (
    "status" <> 'DRAFT' OR ("invoice_number" IS NULL AND "issued_at" IS NULL AND "due_at" IS NULL AND "paid_at" IS NULL)
  ),
  CONSTRAINT "invoice_paid_shape_check" CHECK (
    "status" NOT IN ('PAID', 'REFUNDED') OR "paid_at" IS NOT NULL
  )
);
CREATE INDEX "invoice_organisation_id_status_idx" ON "invoice"("organisation_id", "status");
CREATE INDEX "invoice_billing_account_id_status_idx" ON "invoice"("billing_account_id", "status");

CREATE TABLE "invoice_line_item" (
  "id" UUID NOT NULL,
  "organisation_id" UUID NOT NULL,
  "invoice_id" UUID NOT NULL,
  "description" VARCHAR(500) NOT NULL,
  "currency" CHAR(3) NOT NULL,
  "quantity" BIGINT NOT NULL,
  "unit_amount_minor" BIGINT NOT NULL,
  "tax_rate_basis_points" INTEGER NOT NULL,
  "subtotal_minor" BIGINT NOT NULL,
  "tax_minor" BIGINT NOT NULL,
  "total_minor" BIGINT NOT NULL,
  CONSTRAINT "invoice_line_item_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "invoice_line_item_organisation_id_invoice_id_fkey"
    FOREIGN KEY ("organisation_id", "invoice_id")
    REFERENCES "invoice"("organisation_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "invoice_line_item_description_check" CHECK (length(trim("description")) > 0),
  CONSTRAINT "invoice_line_item_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$'),
  CONSTRAINT "invoice_line_item_quantity_check" CHECK ("quantity" > 0),
  CONSTRAINT "invoice_line_item_amounts_check" CHECK (
    "unit_amount_minor" >= 0
    AND "subtotal_minor" = "quantity" * "unit_amount_minor"
    AND "tax_rate_basis_points" BETWEEN 0 AND 10000
    AND "tax_minor" = (("subtotal_minor" * "tax_rate_basis_points") + 5000) / 10000
    AND "total_minor" = "subtotal_minor" + "tax_minor"
  )
);
CREATE INDEX "invoice_line_item_organisation_id_invoice_id_idx" ON "invoice_line_item"("organisation_id", "invoice_id");

CREATE TABLE "payment" (
  "id" UUID NOT NULL,
  "organisation_id" UUID NOT NULL,
  "billing_account_id" UUID NOT NULL,
  "invoice_id" UUID NOT NULL,
  "payment_method_id" UUID NOT NULL,
  "method" VARCHAR(24) NOT NULL,
  "source_reference" VARCHAR(200) NOT NULL,
  "amount_minor" BIGINT NOT NULL,
  "currency" CHAR(3) NOT NULL,
  "received_at" TIMESTAMPTZ(6) NOT NULL,
  "status" VARCHAR(16) NOT NULL DEFAULT 'UNVERIFIED',
  "status_changed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "verified_at" TIMESTAMPTZ(6),
  "reason" VARCHAR(500),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "payment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payment_organisation_id_fkey"
    FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "payment_organisation_id_billing_account_id_fkey"
    FOREIGN KEY ("organisation_id", "billing_account_id")
    REFERENCES "billing_account"("organisation_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "payment_organisation_id_invoice_id_fkey"
    FOREIGN KEY ("organisation_id", "invoice_id")
    REFERENCES "invoice"("organisation_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "payment_organisation_id_payment_method_id_fkey"
    FOREIGN KEY ("organisation_id", "payment_method_id")
    REFERENCES "payment_method"("organisation_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "payment_method_check" CHECK ("method" IN ('MANUAL_BANK_TRANSFER')),
  CONSTRAINT "payment_reference_check" CHECK (length(trim("source_reference")) > 0),
  CONSTRAINT "payment_amount_check" CHECK ("amount_minor" >= 0),
  CONSTRAINT "payment_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$'),
  CONSTRAINT "payment_status_check" CHECK ("status" IN ('UNVERIFIED', 'VERIFIED', 'REJECTED', 'REVERSED')),
  CONSTRAINT "payment_status_shape_check" CHECK (
    (("status" IN ('VERIFIED', 'REVERSED')) AND "verified_at" IS NOT NULL)
    OR (("status" IN ('UNVERIFIED', 'REJECTED')) AND "verified_at" IS NULL)
  ),
  CONSTRAINT "payment_reason_shape_check" CHECK (
    (("status" IN ('REJECTED', 'REVERSED')) AND "reason" IS NOT NULL AND length(trim("reason")) > 0)
    OR ("status" IN ('UNVERIFIED', 'VERIFIED') AND "reason" IS NULL)
  ),
  CONSTRAINT "payment_organisation_id_payment_method_id_source_reference_key" UNIQUE ("organisation_id", "payment_method_id", "source_reference")
);
CREATE INDEX "payment_organisation_id_invoice_id_idx" ON "payment"("organisation_id", "invoice_id");
CREATE INDEX "payment_organisation_id_status_idx" ON "payment"("organisation_id", "status");

-- Organisation-scoped allocation is serialized by the counter row's unique
-- key and row lock. The returned value is the number allocated for this call;
-- callers can use it as the immutable `INV-00000001` invoice number.
CREATE OR REPLACE FUNCTION "allocate_invoice_number"(p_organisation_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  allocated BIGINT;
BEGIN
  INSERT INTO "invoice_number_counter" ("organisation_id", "next_value", "updated_at")
  VALUES (p_organisation_id, 2, CURRENT_TIMESTAMP)
  ON CONFLICT ("organisation_id") DO UPDATE
    SET "next_value" = "invoice_number_counter"."next_value" + 1,
        "updated_at" = CURRENT_TIMESTAMP
  RETURNING "next_value" - 1 INTO allocated;

  RETURN 'INV-' || lpad(allocated::TEXT, 8, '0');
END;
$$;

-- Issued commercial meaning is immutable at the database boundary. Lifecycle
-- status/timestamps may advance through later application operations, but
-- identity, totals, dates, ownership and source references cannot be rewritten.
CREATE OR REPLACE FUNCTION "prevent_issued_invoice_mutation"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'DRAFT' THEN
      RAISE EXCEPTION 'Issued commercial invoices cannot be deleted' USING ERRCODE = 'check_violation';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.status <> 'DRAFT' AND (
    NEW.organisation_id IS DISTINCT FROM OLD.organisation_id OR
    NEW.billing_account_id IS DISTINCT FROM OLD.billing_account_id OR
    NEW.currency IS DISTINCT FROM OLD.currency OR
    NEW.invoice_number IS DISTINCT FROM OLD.invoice_number OR
    NEW.customer_reference IS DISTINCT FROM OLD.customer_reference OR
    NEW.purchase_order_id IS DISTINCT FROM OLD.purchase_order_id OR
    NEW.subtotal_minor IS DISTINCT FROM OLD.subtotal_minor OR
    NEW.tax_minor IS DISTINCT FROM OLD.tax_minor OR
    NEW.total_minor IS DISTINCT FROM OLD.total_minor OR
    NEW.issued_at IS DISTINCT FROM OLD.issued_at OR
    NEW.due_at IS DISTINCT FROM OLD.due_at
  ) THEN
    RAISE EXCEPTION 'Issued commercial invoice meaning is immutable' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "invoice_issued_immutability"
  BEFORE UPDATE OR DELETE ON "invoice"
  FOR EACH ROW EXECUTE FUNCTION "prevent_issued_invoice_mutation"();

CREATE OR REPLACE FUNCTION "prevent_issued_invoice_line_mutation"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  invoice_status VARCHAR(16);
  invoice_currency CHAR(3);
  invoice_id_value UUID;
  organisation_id_value UUID;
BEGIN
  invoice_id_value := CASE WHEN TG_OP = 'DELETE' THEN OLD.invoice_id ELSE NEW.invoice_id END;
  organisation_id_value := CASE WHEN TG_OP = 'DELETE' THEN OLD.organisation_id ELSE NEW.organisation_id END;
  SELECT status, currency INTO invoice_status, invoice_currency FROM "invoice"
    WHERE id = invoice_id_value AND organisation_id = organisation_id_value;
  IF invoice_status IS NULL THEN
    RAISE EXCEPTION 'Invoice line must reference an existing invoice' USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF invoice_status <> 'DRAFT' THEN
    RAISE EXCEPTION 'Issued invoice lines are immutable' USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP <> 'DELETE' AND NEW.currency IS DISTINCT FROM invoice_currency THEN
    RAISE EXCEPTION 'Invoice line currency must match invoice currency' USING ERRCODE = 'check_violation';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
CREATE TRIGGER "invoice_line_issued_immutability"
  BEFORE INSERT OR UPDATE OR DELETE ON "invoice_line_item"
  FOR EACH ROW EXECUTE FUNCTION "prevent_issued_invoice_line_mutation"();
