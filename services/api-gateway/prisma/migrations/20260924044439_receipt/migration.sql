-- CreateTable
CREATE TABLE "receipt" (
    "id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "billing_account_id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "receipt_number" VARCHAR(64) NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "issued_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "receipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receipt_number_counter" (
    "organisation_id" UUID NOT NULL,
    "next_value" BIGINT NOT NULL DEFAULT 1,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "receipt_number_counter_pkey" PRIMARY KEY ("organisation_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "receipt_payment_id_key" ON "receipt"("payment_id");

-- CreateIndex
CREATE INDEX "receipt_organisation_id_invoice_id_idx" ON "receipt"("organisation_id", "invoice_id");

-- CreateIndex
CREATE UNIQUE INDEX "receipt_organisation_id_receipt_number_key" ON "receipt"("organisation_id", "receipt_number");

-- AddForeignKey
ALTER TABLE "receipt" ADD CONSTRAINT "receipt_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipt" ADD CONSTRAINT "receipt_organisation_id_invoice_id_fkey" FOREIGN KEY ("organisation_id", "invoice_id") REFERENCES "invoice"("organisation_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipt" ADD CONSTRAINT "receipt_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipt_number_counter" ADD CONSTRAINT "receipt_number_counter_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Organisation-scoped allocation is serialized by the counter row's unique
-- key and row lock — the exact same pattern "allocate_invoice_number"
-- already uses. The returned value is the number allocated for this call;
-- callers use it as the immutable "RCP-00000001" receipt number.
CREATE OR REPLACE FUNCTION "allocate_receipt_number"(p_organisation_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  allocated BIGINT;
BEGIN
  INSERT INTO "receipt_number_counter" ("organisation_id", "next_value", "updated_at")
  VALUES (p_organisation_id, 2, CURRENT_TIMESTAMP)
  ON CONFLICT ("organisation_id") DO UPDATE
    SET "next_value" = "receipt_number_counter"."next_value" + 1,
        "updated_at" = CURRENT_TIMESTAMP
  RETURNING "next_value" - 1 INTO allocated;

  RETURN 'RCP-' || lpad(allocated::TEXT, 8, '0');
END;
$$;
