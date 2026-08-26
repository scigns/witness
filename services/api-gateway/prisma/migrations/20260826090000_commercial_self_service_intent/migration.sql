-- Commercial Foundation C2. Customer intent only; no request activates service.
CREATE TABLE "commercial_change_request" (
  "id" UUID NOT NULL,
  "billing_account_id" UUID NOT NULL,
  "organisation_id" UUID NOT NULL,
  "action" VARCHAR(16) NOT NULL,
  "source_subscription_id" UUID NOT NULL,
  "source_subscription_updated_at" TIMESTAMPTZ(6) NOT NULL,
  "requested_plan_code" VARCHAR(32),
  "billing_interval" VARCHAR(16),
  "payment_method" VARCHAR(24),
  "status" VARCHAR(16) NOT NULL DEFAULT 'PENDING',
  "effective_at" TIMESTAMPTZ(6),
  "idempotency_key" UUID NOT NULL,
  "requested_by_id" UUID NOT NULL,
  "requested_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "commercial_change_request_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "commercial_change_request_billing_account_id_fkey" FOREIGN KEY ("billing_account_id") REFERENCES "billing_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "commercial_change_request_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "commercial_change_request_source_subscription_id_fkey" FOREIGN KEY ("source_subscription_id") REFERENCES "subscription"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "commercial_change_request_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "commercial_change_request_action_check" CHECK ("action" IN ('CHANGE_PLAN','REQUEST_QUOTE','CANCEL')),
  CONSTRAINT "commercial_change_request_plan_check" CHECK ("requested_plan_code" IS NULL OR "requested_plan_code" IN ('FREE','TEAM','ORGANISATION','INSTITUTIONAL')),
  CONSTRAINT "commercial_change_request_interval_check" CHECK ("billing_interval" IS NULL OR "billing_interval" IN ('MONTHLY','YEARLY')),
  CONSTRAINT "commercial_change_request_payment_check" CHECK ("payment_method" IS NULL OR "payment_method" IN ('CARD','BANK_TRANSFER','INVOICE')),
  CONSTRAINT "commercial_change_request_status_check" CHECK ("status" IN ('PENDING','APPLIED','REJECTED','SUPERSEDED')),
  CONSTRAINT "commercial_change_request_shape_check" CHECK (("action" = 'CANCEL' AND "requested_plan_code" IS NULL AND "billing_interval" IS NULL AND "payment_method" IS NULL) OR ("action" = 'REQUEST_QUOTE' AND "requested_plan_code" = 'INSTITUTIONAL' AND "billing_interval" IS NULL AND "payment_method" IS NULL) OR ("action" = 'CHANGE_PLAN' AND "requested_plan_code" IN ('FREE','TEAM','ORGANISATION') AND (("requested_plan_code" = 'FREE' AND "billing_interval" IS NULL AND "payment_method" IS NULL) OR ("requested_plan_code" <> 'FREE' AND "billing_interval" IS NOT NULL AND "payment_method" IS NOT NULL)))),
  CONSTRAINT "commercial_change_request_organisation_id_idempotency_key_key" UNIQUE ("organisation_id", "idempotency_key")
);
CREATE INDEX "commercial_change_request_organisation_id_status_idx" ON "commercial_change_request"("organisation_id", "status");
CREATE UNIQUE INDEX "commercial_change_request_one_pending_per_organisation_idx" ON "commercial_change_request"("organisation_id") WHERE "status" = 'PENDING';
