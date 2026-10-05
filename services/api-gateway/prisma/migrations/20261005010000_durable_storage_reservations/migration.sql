-- Additive ledger: preserves all existing customer bytes and quota overrides.
CREATE TABLE "storage_reservation" (
 "id" UUID PRIMARY KEY,
 "organisation_id" UUID NOT NULL REFERENCES "organisation"("id") ON DELETE RESTRICT,
 "request_key" UUID NOT NULL,
 "request_fingerprint" VARCHAR(64) NOT NULL,
 "storage_kind" VARCHAR(32) NOT NULL,
 "target_id" UUID NOT NULL,
 "storage_key" VARCHAR(500),
 "size_bytes" BIGINT NOT NULL CHECK ("size_bytes" >= 0),
 "state" VARCHAR(32) NOT NULL DEFAULT 'RESERVED'
   CHECK ("state" IN ('RESERVED','WRITING','COMMITTED','RELEASED','NEEDS_RECONCILIATION')),
 "expires_at" TIMESTAMPTZ(6) NOT NULL,
 "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updated_at" TIMESTAMPTZ(6) NOT NULL,
 CHECK ("storage_kind" IN ('evidence-attachment','resource')),
 UNIQUE ("organisation_id", "request_key"),
 UNIQUE ("storage_kind", "target_id"),
 UNIQUE ("storage_key")
);
CREATE INDEX "storage_reservation_organisation_id_state_idx" ON "storage_reservation"("organisation_id", "state");
CREATE INDEX "storage_reservation_state_expires_at_idx" ON "storage_reservation"("state", "expires_at");
