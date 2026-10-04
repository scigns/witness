-- Commercial entitlements: Tenant seam, ResourceProfile catalogue, and five
-- new entitlement keys (ADR-0034). Additive only — no existing table,
-- column, or row is renamed, dropped, or rewritten. Every existing
-- organisation's "tenant_id" starts NULL (effective tenant = itself,
-- preserving today's de facto 1:1 reality exactly). Every existing
-- organisation's subscription gains plan-default values for the five new
-- entitlement keys below through ordinary PlanEntitlement rows — nothing
-- about an existing subscription or override is touched.

-- AlterTable
ALTER TABLE "organisation" ADD COLUMN "tenant_id" UUID;

-- CreateTable
CREATE TABLE "tenant" (
    "id" UUID NOT NULL,
    "label" VARCHAR(200) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resource_profile" (
    "id" UUID NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" VARCHAR(500) NOT NULL,
    "compute_class" VARCHAR(32) NOT NULL,
    "memory_class" VARCHAR(32) NOT NULL,
    "storage_quota_bytes" BIGINT NOT NULL,
    "concurrency_limit" INTEGER NOT NULL,
    "worker_allocation" INTEGER NOT NULL,
    "job_limit" INTEGER NOT NULL,
    "backup_profile" VARCHAR(32) NOT NULL,
    "retention_profile" VARCHAR(32) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "resource_profile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "resource_profile_code_key" ON "resource_profile"("code");

-- CreateIndex
CREATE INDEX "organisation_tenant_id_idx" ON "organisation"("tenant_id");

-- AddForeignKey
ALTER TABLE "organisation" ADD CONSTRAINT "organisation_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Declarative capacity catalogue. "sovereign" is deliberately not any plan's
-- default below — it exists only as a target for a negotiated subscription
-- override (ADR-0034's "contractually authorised" override case), the same
-- way the pre-existing INSTITUTIONAL plan_entitlement defaults are already
-- commented as "expected to be replaced by explicit, reasoned subscription
-- overrides in a contract."
INSERT INTO "resource_profile" ("id", "code", "name", "description", "compute_class", "memory_class", "storage_quota_bytes", "concurrency_limit", "worker_allocation", "job_limit", "backup_profile", "retention_profile", "active") VALUES
  ('50000000-0000-4000-8000-000000000001', 'standard-free', 'Standard (Free)', 'Logical isolation on shared infrastructure, entry capacity.', 'shared-standard', 'shared-standard', 1073741824, 2, 1, 10, 'none', 'standard-7d', true),
  ('50000000-0000-4000-8000-000000000002', 'standard-small', 'Standard', 'Logical isolation on shared infrastructure, small-team capacity.', 'shared-standard', 'shared-standard', 10737418240, 5, 1, 50, 'daily-7d', 'standard-30d', true),
  ('50000000-0000-4000-8000-000000000003', 'enhanced', 'Enhanced', 'Stronger workload/data isolation on shared infrastructure, organisation capacity.', 'shared-enhanced', 'shared-enhanced', 107374182400, 20, 2, 200, 'daily-14d', 'standard-90d', true),
  ('50000000-0000-4000-8000-000000000004', 'institutional', 'Institutional', 'Dedicated application/database resources, institutional capacity.', 'dedicated-standard', 'dedicated-standard', 107374182400, 50, 4, 1000, 'daily-30d', 'extended-365d', true),
  ('50000000-0000-4000-8000-000000000005', 'sovereign', 'Sovereign', 'Dedicated environment, configurable residency, negotiated capacity. Not a plan default; assigned only via a reasoned subscription override.', 'dedicated-sovereign', 'dedicated-sovereign', 536870912000, 100, 8, 5000, 'daily-30d', 'extended-indefinite', true);

INSERT INTO "entitlement_definition" ("id", "key", "value_type", "unit", "description") VALUES
  ('31000000-0000-4000-8000-000000000001', 'resource.profile', 'STRING', NULL, 'Declarative capacity profile (resource_profile.code)'),
  ('31000000-0000-4000-8000-000000000002', 'deployment.isolation', 'STRING', NULL, 'Contracted isolation tier: SHARED, ISOLATED_DATA, DEDICATED or SOVEREIGN'),
  ('31000000-0000-4000-8000-000000000003', 'audit.retention_days', 'INTEGER', 'days', 'Audit/evidence retention period'),
  ('31000000-0000-4000-8000-000000000004', 'branding.custom', 'BOOLEAN', NULL, 'Custom branding eligibility'),
  ('31000000-0000-4000-8000-000000000005', 'integrations.enabled', 'BOOLEAN', NULL, 'Third-party integrations eligibility');

-- Every existing plan gets an explicit default for every new key, the same
-- "absent key fails closed, never inferred" reasoning the original C1
-- commercial foundation migration states for its own seed data.
INSERT INTO "plan_entitlement" ("id", "plan_id", "entitlement_definition_id", "value") VALUES
  ('41000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','31000000-0000-4000-8000-000000000001','{"type":"STRING","value":"standard-free"}'),
  ('41000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','31000000-0000-4000-8000-000000000002','{"type":"STRING","value":"SHARED"}'),
  ('41000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','31000000-0000-4000-8000-000000000003','{"type":"INTEGER","value":30}'),
  ('41000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000001','31000000-0000-4000-8000-000000000004','{"type":"BOOLEAN","value":false}'),
  ('41000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000001','31000000-0000-4000-8000-000000000005','{"type":"BOOLEAN","value":false}'),
  ('41000000-0000-4000-8000-000000000006','10000000-0000-4000-8000-000000000002','31000000-0000-4000-8000-000000000001','{"type":"STRING","value":"standard-small"}'),
  ('41000000-0000-4000-8000-000000000007','10000000-0000-4000-8000-000000000002','31000000-0000-4000-8000-000000000002','{"type":"STRING","value":"SHARED"}'),
  ('41000000-0000-4000-8000-000000000008','10000000-0000-4000-8000-000000000002','31000000-0000-4000-8000-000000000003','{"type":"INTEGER","value":90}'),
  ('41000000-0000-4000-8000-000000000009','10000000-0000-4000-8000-000000000002','31000000-0000-4000-8000-000000000004','{"type":"BOOLEAN","value":false}'),
  ('41000000-0000-4000-8000-000000000010','10000000-0000-4000-8000-000000000002','31000000-0000-4000-8000-000000000005','{"type":"BOOLEAN","value":false}'),
  ('41000000-0000-4000-8000-000000000011','10000000-0000-4000-8000-000000000003','31000000-0000-4000-8000-000000000001','{"type":"STRING","value":"enhanced"}'),
  ('41000000-0000-4000-8000-000000000012','10000000-0000-4000-8000-000000000003','31000000-0000-4000-8000-000000000002','{"type":"STRING","value":"ISOLATED_DATA"}'),
  ('41000000-0000-4000-8000-000000000013','10000000-0000-4000-8000-000000000003','31000000-0000-4000-8000-000000000003','{"type":"INTEGER","value":365}'),
  ('41000000-0000-4000-8000-000000000014','10000000-0000-4000-8000-000000000003','31000000-0000-4000-8000-000000000004','{"type":"BOOLEAN","value":true}'),
  ('41000000-0000-4000-8000-000000000015','10000000-0000-4000-8000-000000000003','31000000-0000-4000-8000-000000000005','{"type":"BOOLEAN","value":true}'),
  ('41000000-0000-4000-8000-000000000016','10000000-0000-4000-8000-000000000004','31000000-0000-4000-8000-000000000001','{"type":"STRING","value":"institutional"}'),
  ('41000000-0000-4000-8000-000000000017','10000000-0000-4000-8000-000000000004','31000000-0000-4000-8000-000000000002','{"type":"STRING","value":"DEDICATED"}'),
  ('41000000-0000-4000-8000-000000000018','10000000-0000-4000-8000-000000000004','31000000-0000-4000-8000-000000000003','{"type":"INTEGER","value":1825}'),
  ('41000000-0000-4000-8000-000000000019','10000000-0000-4000-8000-000000000004','31000000-0000-4000-8000-000000000004','{"type":"BOOLEAN","value":true}'),
  ('41000000-0000-4000-8000-000000000020','10000000-0000-4000-8000-000000000004','31000000-0000-4000-8000-000000000005','{"type":"BOOLEAN","value":true}');
