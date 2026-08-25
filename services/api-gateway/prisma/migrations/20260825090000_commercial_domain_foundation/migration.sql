-- Witness Commercial Foundation, C1. Additive only.
-- Catalogue identifiers are stable so environments receive the same seed.

CREATE TABLE "plan" (
  "id" UUID NOT NULL,
  "code" VARCHAR(32) NOT NULL,
  "name" VARCHAR(100) NOT NULL,
  "description" VARCHAR(1000) NOT NULL,
  "quote_based" BOOLEAN NOT NULL DEFAULT false,
  "active" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "plan_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "plan_code_key" UNIQUE ("code"),
  CONSTRAINT "plan_code_check" CHECK ("code" IN ('FREE','TEAM','ORGANISATION','INSTITUTIONAL'))
);

CREATE TABLE "plan_price" (
  "id" UUID NOT NULL,
  "plan_id" UUID NOT NULL,
  "interval" VARCHAR(16) NOT NULL,
  "currency" CHAR(3) NOT NULL,
  "amount_minor" INTEGER NOT NULL,
  "starting_from" BOOLEAN NOT NULL DEFAULT false,
  "active" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "plan_price_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "plan_price_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "plan_price_interval_check" CHECK ("interval" IN ('MONTHLY','YEARLY')),
  CONSTRAINT "plan_price_amount_check" CHECK ("amount_minor" >= 0),
  CONSTRAINT "plan_price_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$'),
  CONSTRAINT "plan_price_plan_id_interval_currency_key" UNIQUE ("plan_id", "interval", "currency")
);
CREATE INDEX "plan_price_plan_id_active_idx" ON "plan_price"("plan_id", "active");

CREATE TABLE "entitlement_definition" (
  "id" UUID NOT NULL,
  "key" VARCHAR(100) NOT NULL,
  "value_type" VARCHAR(16) NOT NULL,
  "unit" VARCHAR(32),
  "description" VARCHAR(500) NOT NULL,
  CONSTRAINT "entitlement_definition_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "entitlement_definition_key_key" UNIQUE ("key"),
  CONSTRAINT "entitlement_definition_type_check" CHECK ("value_type" IN ('BOOLEAN','INTEGER','STRING')),
  CONSTRAINT "entitlement_definition_key_check" CHECK ("key" ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$')
);

CREATE TABLE "plan_entitlement" (
  "id" UUID NOT NULL,
  "plan_id" UUID NOT NULL,
  "entitlement_definition_id" UUID NOT NULL,
  "value" JSONB NOT NULL,
  CONSTRAINT "plan_entitlement_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "plan_entitlement_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plan"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "plan_entitlement_definition_id_fkey" FOREIGN KEY ("entitlement_definition_id") REFERENCES "entitlement_definition"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "plan_entitlement_plan_id_entitlement_definition_id_key" UNIQUE ("plan_id", "entitlement_definition_id")
);
CREATE INDEX "plan_entitlement_entitlement_definition_id_idx" ON "plan_entitlement"("entitlement_definition_id");

CREATE TABLE "billing_account" (
  "id" UUID NOT NULL,
  "organisation_id" UUID NOT NULL,
  "currency" CHAR(3) NOT NULL DEFAULT 'AUD',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "billing_account_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "billing_account_organisation_id_key" UNIQUE ("organisation_id"),
  CONSTRAINT "billing_account_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "billing_account_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$')
);

CREATE TABLE "subscription" (
  "id" UUID NOT NULL,
  "organisation_id" UUID NOT NULL,
  "billing_account_id" UUID NOT NULL,
  "plan_id" UUID NOT NULL,
  "status" VARCHAR(16) NOT NULL,
  "billing_interval" VARCHAR(16),
  "current_period_start" TIMESTAMPTZ(6) NOT NULL,
  "current_period_end" TIMESTAMPTZ(6),
  "cancel_at_period_end" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "subscription_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "subscription_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "subscription_billing_account_id_fkey" FOREIGN KEY ("billing_account_id") REFERENCES "billing_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "subscription_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "subscription_status_check" CHECK ("status" IN ('FREE','TRIALING','ACTIVE','PAST_DUE','SUSPENDED','CANCELLED')),
  CONSTRAINT "subscription_interval_check" CHECK ("billing_interval" IS NULL OR "billing_interval" IN ('MONTHLY','YEARLY')),
  CONSTRAINT "subscription_period_check" CHECK ("current_period_end" IS NULL OR "current_period_end" > "current_period_start")
);
CREATE INDEX "subscription_organisation_id_status_idx" ON "subscription"("organisation_id", "status");
CREATE INDEX "subscription_billing_account_id_idx" ON "subscription"("billing_account_id");
CREATE INDEX "subscription_plan_id_idx" ON "subscription"("plan_id");
CREATE UNIQUE INDEX "subscription_one_current_per_organisation_idx" ON "subscription"("organisation_id")
  WHERE "status" IN ('FREE','TRIALING','ACTIVE','PAST_DUE','SUSPENDED');

CREATE TABLE "subscription_entitlement_override" (
  "id" UUID NOT NULL,
  "subscription_id" UUID NOT NULL,
  "entitlement_definition_id" UUID NOT NULL,
  "value" JSONB NOT NULL,
  "reason" VARCHAR(500) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "subscription_entitlement_override_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "subscription_entitlement_override_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscription"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "subscription_entitlement_override_definition_id_fkey" FOREIGN KEY ("entitlement_definition_id") REFERENCES "entitlement_definition"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "subscription_entitlement_override_reason_check" CHECK (length(trim("reason")) > 0),
  CONSTRAINT "subscription_entitlement_override_subscription_id_entitlement_definition_id_key" UNIQUE ("subscription_id", "entitlement_definition_id")
);
CREATE INDEX "subscription_entitlement_override_definition_id_idx" ON "subscription_entitlement_override"("entitlement_definition_id");

INSERT INTO "plan" ("id", "code", "name", "description", "quote_based", "active") VALUES
  ('10000000-0000-4000-8000-000000000001', 'FREE', 'Free', 'Real self-service onboarding for small teams.', false, true),
  ('10000000-0000-4000-8000-000000000002', 'TEAM', 'Team', 'Institutional memory for a working team.', false, true),
  ('10000000-0000-4000-8000-000000000003', 'ORGANISATION', 'Organisation', 'Governance, integrations and scale for organisations.', false, true),
  ('10000000-0000-4000-8000-000000000004', 'INSTITUTIONAL', 'Institutional', 'Negotiated sovereignty, deployment and procurement requirements.', true, true);

INSERT INTO "plan_price" ("id", "plan_id", "interval", "currency", "amount_minor", "starting_from") VALUES
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'MONTHLY', 'AUD', 0, false),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'YEARLY', 'AUD', 0, false),
  ('20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000002', 'MONTHLY', 'AUD', 9900, false),
  ('20000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000002', 'YEARLY', 'AUD', 99000, false),
  ('20000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000003', 'MONTHLY', 'AUD', 69900, false),
  ('20000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000003', 'YEARLY', 'AUD', 699000, false),
  ('20000000-0000-4000-8000-000000000007', '10000000-0000-4000-8000-000000000004', 'MONTHLY', 'AUD', 150000, true);

INSERT INTO "entitlement_definition" ("id", "key", "value_type", "unit", "description") VALUES
  ('30000000-0000-4000-8000-000000000001', 'users.max', 'INTEGER', 'users', 'Maximum active users'),
  ('30000000-0000-4000-8000-000000000002', 'active_projects.max', 'INTEGER', 'projects', 'Maximum active projects/programs'),
  ('30000000-0000-4000-8000-000000000003', 'storage.gb', 'INTEGER', 'GB', 'Included storage allowance'),
  ('30000000-0000-4000-8000-000000000004', 'session_capture.basic', 'BOOLEAN', NULL, 'Basic meeting/session capture'),
  ('30000000-0000-4000-8000-000000000005', 'institutional_memory.basic', 'BOOLEAN', NULL, 'Basic institutional memory workflow'),
  ('30000000-0000-4000-8000-000000000006', 'exports.level', 'STRING', NULL, 'Export capability level'),
  ('30000000-0000-4000-8000-000000000007', 'ai.allowance.units', 'INTEGER', 'units', 'Included AI/compute allowance'),
  ('30000000-0000-4000-8000-000000000008', 'api.enabled', 'BOOLEAN', NULL, 'API and integration access'),
  ('30000000-0000-4000-8000-000000000009', 'sso.enabled', 'BOOLEAN', NULL, 'Single sign-on configuration'),
  ('30000000-0000-4000-8000-000000000010', 'dedicated_deployment.enabled', 'BOOLEAN', NULL, 'Dedicated deployment eligibility'),
  ('30000000-0000-4000-8000-000000000011', 'support.level', 'STRING', NULL, 'Support service level'),
  ('30000000-0000-4000-8000-000000000012', 'audit.verify', 'BOOLEAN', NULL, 'Audit chain verification'),
  ('30000000-0000-4000-8000-000000000013', 'workspace.organisation', 'BOOLEAN', NULL, 'Organisation workspace support'),
  ('30000000-0000-4000-8000-000000000014', 'administration.level', 'STRING', NULL, 'Administration capability level'),
  ('30000000-0000-4000-8000-000000000015', 'invoice_payment.enabled', 'BOOLEAN', NULL, 'Invoice and bank-transfer payment eligibility'),
  ('30000000-0000-4000-8000-000000000016', 'retention.custom', 'BOOLEAN', NULL, 'Custom retention policy eligibility');

-- Compact helper data set: every plan gets every defined key, so an absent key
-- fails closed and a catalogue comparison never has to infer a default.
INSERT INTO "plan_entitlement" ("id", "plan_id", "entitlement_definition_id", "value") VALUES
  ('40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','{"type":"INTEGER","value":3}'),
  ('40000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002','{"type":"INTEGER","value":1}'),
  ('40000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000003','{"type":"INTEGER","value":1}'),
  ('40000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000004','{"type":"BOOLEAN","value":true}'),
  ('40000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000005','{"type":"BOOLEAN","value":true}'),
  ('40000000-0000-4000-8000-000000000006','10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000006','{"type":"STRING","value":"limited"}'),
  ('40000000-0000-4000-8000-000000000007','10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000007','{"type":"INTEGER","value":100}'),
  ('40000000-0000-4000-8000-000000000008','10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000008','{"type":"BOOLEAN","value":false}'),
  ('40000000-0000-4000-8000-000000000009','10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000009','{"type":"BOOLEAN","value":false}'),
  ('40000000-0000-4000-8000-000000000010','10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000010','{"type":"BOOLEAN","value":false}'),
  ('40000000-0000-4000-8000-000000000011','10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000011','{"type":"STRING","value":"community"}'),
  ('40000000-0000-4000-8000-000000000012','10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000012','{"type":"BOOLEAN","value":false}'),
  ('40000000-0000-4000-8000-000000000013','10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000013','{"type":"BOOLEAN","value":false}'),
  ('40000000-0000-4000-8000-000000000014','10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000014','{"type":"STRING","value":"self_service"}'),
  ('40000000-0000-4000-8000-000000000015','10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000015','{"type":"BOOLEAN","value":false}'),
  ('40000000-0000-4000-8000-000000000016','10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000016','{"type":"BOOLEAN","value":false}'),
  ('40000000-0000-4000-8000-000000000017','10000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000001','{"type":"INTEGER","value":10}'),
  ('40000000-0000-4000-8000-000000000018','10000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000002','{"type":"INTEGER","value":5}'),
  ('40000000-0000-4000-8000-000000000019','10000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000003','{"type":"INTEGER","value":10}'),
  ('40000000-0000-4000-8000-000000000020','10000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000004','{"type":"BOOLEAN","value":true}'),
  ('40000000-0000-4000-8000-000000000021','10000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000005','{"type":"BOOLEAN","value":true}'),
  ('40000000-0000-4000-8000-000000000022','10000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000006','{"type":"STRING","value":"full"}'),
  ('40000000-0000-4000-8000-000000000023','10000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000007','{"type":"INTEGER","value":1000}'),
  ('40000000-0000-4000-8000-000000000024','10000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000008','{"type":"BOOLEAN","value":false}'),
  ('40000000-0000-4000-8000-000000000025','10000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000009','{"type":"BOOLEAN","value":false}'),
  ('40000000-0000-4000-8000-000000000026','10000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000010','{"type":"BOOLEAN","value":false}'),
  ('40000000-0000-4000-8000-000000000027','10000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000011','{"type":"STRING","value":"email"}'),
  ('40000000-0000-4000-8000-000000000028','10000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000012','{"type":"BOOLEAN","value":true}'),
  ('40000000-0000-4000-8000-000000000029','10000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000013','{"type":"BOOLEAN","value":true}'),
  ('40000000-0000-4000-8000-000000000030','10000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000014','{"type":"STRING","value":"basic"}'),
  ('40000000-0000-4000-8000-000000000031','10000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000015','{"type":"BOOLEAN","value":false}'),
  ('40000000-0000-4000-8000-000000000032','10000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000016','{"type":"BOOLEAN","value":false}'),
  ('40000000-0000-4000-8000-000000000033','10000000-0000-4000-8000-000000000003','30000000-0000-4000-8000-000000000001','{"type":"INTEGER","value":50}'),
  ('40000000-0000-4000-8000-000000000034','10000000-0000-4000-8000-000000000003','30000000-0000-4000-8000-000000000002','{"type":"INTEGER","value":25}'),
  ('40000000-0000-4000-8000-000000000035','10000000-0000-4000-8000-000000000003','30000000-0000-4000-8000-000000000003','{"type":"INTEGER","value":100}'),
  ('40000000-0000-4000-8000-000000000036','10000000-0000-4000-8000-000000000003','30000000-0000-4000-8000-000000000004','{"type":"BOOLEAN","value":true}'),
  ('40000000-0000-4000-8000-000000000037','10000000-0000-4000-8000-000000000003','30000000-0000-4000-8000-000000000005','{"type":"BOOLEAN","value":true}'),
  ('40000000-0000-4000-8000-000000000038','10000000-0000-4000-8000-000000000003','30000000-0000-4000-8000-000000000006','{"type":"STRING","value":"full"}'),
  ('40000000-0000-4000-8000-000000000039','10000000-0000-4000-8000-000000000003','30000000-0000-4000-8000-000000000007','{"type":"INTEGER","value":10000}'),
  ('40000000-0000-4000-8000-000000000040','10000000-0000-4000-8000-000000000003','30000000-0000-4000-8000-000000000008','{"type":"BOOLEAN","value":true}'),
  ('40000000-0000-4000-8000-000000000041','10000000-0000-4000-8000-000000000003','30000000-0000-4000-8000-000000000009','{"type":"BOOLEAN","value":false}'),
  ('40000000-0000-4000-8000-000000000042','10000000-0000-4000-8000-000000000003','30000000-0000-4000-8000-000000000010','{"type":"BOOLEAN","value":false}'),
  ('40000000-0000-4000-8000-000000000043','10000000-0000-4000-8000-000000000003','30000000-0000-4000-8000-000000000011','{"type":"STRING","value":"priority"}'),
  ('40000000-0000-4000-8000-000000000044','10000000-0000-4000-8000-000000000003','30000000-0000-4000-8000-000000000012','{"type":"BOOLEAN","value":true}'),
  ('40000000-0000-4000-8000-000000000045','10000000-0000-4000-8000-000000000003','30000000-0000-4000-8000-000000000013','{"type":"BOOLEAN","value":true}'),
  ('40000000-0000-4000-8000-000000000046','10000000-0000-4000-8000-000000000003','30000000-0000-4000-8000-000000000014','{"type":"STRING","value":"advanced"}'),
  ('40000000-0000-4000-8000-000000000047','10000000-0000-4000-8000-000000000003','30000000-0000-4000-8000-000000000015','{"type":"BOOLEAN","value":true}'),
  ('40000000-0000-4000-8000-000000000048','10000000-0000-4000-8000-000000000003','30000000-0000-4000-8000-000000000016','{"type":"BOOLEAN","value":false}');

-- Institutional limits are deliberately conservative defaults and are expected
-- to be replaced by explicit, reasoned subscription overrides in a contract.
INSERT INTO "plan_entitlement" ("id", "plan_id", "entitlement_definition_id", "value")
SELECT ('40000000-0000-4000-8000-' || lpad((48 + row_number() OVER (ORDER BY "id"))::text, 12, '0'))::uuid,
       '10000000-0000-4000-8000-000000000004'::uuid, "id",
       CASE "key"
         WHEN 'users.max' THEN '{"type":"INTEGER","value":50}'::jsonb
         WHEN 'active_projects.max' THEN '{"type":"INTEGER","value":25}'::jsonb
         WHEN 'storage.gb' THEN '{"type":"INTEGER","value":100}'::jsonb
         WHEN 'ai.allowance.units' THEN '{"type":"INTEGER","value":10000}'::jsonb
         WHEN 'exports.level' THEN '{"type":"STRING","value":"full"}'::jsonb
         WHEN 'support.level' THEN '{"type":"STRING","value":"sla"}'::jsonb
         WHEN 'administration.level' THEN '{"type":"STRING","value":"advanced"}'::jsonb
         ELSE jsonb_build_object('type', 'BOOLEAN', 'value', true)
       END
FROM "entitlement_definition";

-- Existing customers start free. gen_random_uuid() is built into supported
-- PostgreSQL versions and is used only for tenant-owned state, not catalogue IDs.
INSERT INTO "billing_account" ("id", "organisation_id", "currency", "created_at", "updated_at")
SELECT gen_random_uuid(), "id", 'AUD', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP FROM "organisation";

INSERT INTO "subscription" ("id", "organisation_id", "billing_account_id", "plan_id", "status", "billing_interval", "current_period_start", "current_period_end", "cancel_at_period_end", "created_at", "updated_at")
SELECT gen_random_uuid(), ba."organisation_id", ba."id", '10000000-0000-4000-8000-000000000001', 'FREE', NULL,
       CURRENT_TIMESTAMP, NULL, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "billing_account" ba;
