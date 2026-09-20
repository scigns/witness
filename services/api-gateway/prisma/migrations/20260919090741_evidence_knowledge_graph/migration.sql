-- Rollback note (Prisma does not generate down-migrations): this migration
-- is purely additive — 14 new tables, zero ALTERs to any pre-existing
-- table or column. Rolling back is therefore zero-risk to existing data:
-- `DROP TABLE "outbox", "event_log_entry", "knowledge_relationship",
-- "knowledge_entity_attribute", "knowledge_assertion",
-- "knowledge_provenance_chain", "knowledge_review_decision",
-- "knowledge_candidate_assertion", "knowledge_entity_merge_log",
-- "entity_alias", "knowledge_entity", "relationship_type_definition",
-- "knowledge_domain", "knowledge_graph_projection_checkpoint" CASCADE;`
-- (that order respects FK dependency; CASCADE is belt-and-braces, not
-- load-bearing, given the explicit order), then remove this row from
-- `_prisma_migrations`. No other table's rows are ever touched by this
-- migration or its rollback.

-- CreateTable
CREATE TABLE "knowledge_domain" (
    "id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "key" VARCHAR(64) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "validation_policy" JSONB NOT NULL,
    "default_sensitivity" VARCHAR(16) NOT NULL DEFAULT 'internal',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_id" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "knowledge_domain_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "relationship_type_definition" (
    "code" VARCHAR(64) NOT NULL,
    "category" VARCHAR(32) NOT NULL,
    "description" TEXT NOT NULL,
    "is_core" BOOLEAN NOT NULL DEFAULT false,
    "inverse_code" VARCHAR(64),
    "ontology_version" VARCHAR(20) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "relationship_type_definition_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "knowledge_entity" (
    "id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "entity_type" VARCHAR(32) NOT NULL,
    "topic_scheme" VARCHAR(32),
    "canonical_label" VARCHAR(300) NOT NULL,
    "definition" TEXT,
    "sensitivity_class" VARCHAR(16) NOT NULL DEFAULT 'internal',
    "community_restriction_id" UUID,
    "status" VARCHAR(16) NOT NULL DEFAULT 'active',
    "merged_into_id" UUID,
    "ontology_version" VARCHAR(20) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_id" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "knowledge_entity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entity_alias" (
    "id" UUID NOT NULL,
    "entity_id" UUID NOT NULL,
    "alias_text" VARCHAR(300) NOT NULL,
    "language" VARCHAR(20),
    "source_evidence_id" UUID,
    "contributed_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "entity_alias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_entity_merge_log" (
    "id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "surviving_entity_id" UUID NOT NULL,
    "merged_entity_id" UUID NOT NULL,
    "decided_by_id" UUID NOT NULL,
    "decided_at" TIMESTAMPTZ(6) NOT NULL,
    "rationale" TEXT NOT NULL,
    "reversible_until" TIMESTAMPTZ(6) NOT NULL,
    "reversed_at" TIMESTAMPTZ(6),

    CONSTRAINT "knowledge_entity_merge_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_candidate_assertion" (
    "id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "knowledge_domain_id" UUID,
    "assertion_type" VARCHAR(24) NOT NULL,
    "payload" JSONB NOT NULL,
    "source_evidence_ids" UUID[],
    "source_utterance_refs" JSONB,
    "confidence" DOUBLE PRECISION,
    "extraction_method" VARCHAR(16) NOT NULL,
    "extraction_model" VARCHAR(200),
    "extraction_model_version" VARCHAR(100),
    "prompt_version" VARCHAR(100),
    "proposed_by_id" UUID NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'pending',
    "superseded_by_candidate_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "knowledge_candidate_assertion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_review_decision" (
    "id" UUID NOT NULL,
    "candidate_id" UUID NOT NULL,
    "reviewer_actor_id" UUID NOT NULL,
    "decision" VARCHAR(32) NOT NULL,
    "corrected_payload" JSONB,
    "rationale" TEXT,
    "decided_at" TIMESTAMPTZ(6) NOT NULL,
    "review_duration_ms" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "knowledge_review_decision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_provenance_chain" (
    "id" UUID NOT NULL,
    "candidate_id" UUID,
    "source_evidence_ids" UUID[],
    "source_utterance_refs" JSONB,
    "extraction_method" VARCHAR(16) NOT NULL,
    "extraction_model" VARCHAR(200),
    "extraction_model_version" VARCHAR(100),
    "prompt_version" VARCHAR(100),
    "consent_basis" TEXT[],
    "confirmed_by_actor_id" UUID NOT NULL,
    "confirmed_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "knowledge_provenance_chain_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_assertion" (
    "id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "knowledge_domain_id" UUID,
    "candidate_id" UUID,
    "assertion_type" VARCHAR(24) NOT NULL,
    "provenance_chain_id" UUID NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "sensitivity_class" VARCHAR(16) NOT NULL DEFAULT 'internal',
    "lifecycle_state" VARCHAR(24) NOT NULL DEFAULT 'facilitator_curated',
    "perspective_tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "group_attribution_id" UUID,
    "access_scope" VARCHAR(16) NOT NULL DEFAULT 'internal',
    "valid_from" TIMESTAMPTZ(6) NOT NULL,
    "valid_to" TIMESTAMPTZ(6),
    "retracted_at" TIMESTAMPTZ(6),
    "retracted_reason" TEXT,
    "recorded_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_id" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "knowledge_assertion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_entity_attribute" (
    "id" UUID NOT NULL,
    "entity_id" UUID NOT NULL,
    "attribute_key" VARCHAR(100) NOT NULL,
    "attribute_value" TEXT NOT NULL,
    "assertion_id" UUID NOT NULL,
    "valid_from" TIMESTAMPTZ(6) NOT NULL,
    "valid_to" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_id" UUID NOT NULL,

    CONSTRAINT "knowledge_entity_attribute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_relationship" (
    "id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "from_entity_id" UUID NOT NULL,
    "to_entity_id" UUID NOT NULL,
    "relationship_type" VARCHAR(64) NOT NULL,
    "assertion_id" UUID NOT NULL,
    "valid_from" TIMESTAMPTZ(6) NOT NULL,
    "valid_to" TIMESTAMPTZ(6),
    "strength" DOUBLE PRECISION,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_id" UUID NOT NULL,

    CONSTRAINT "knowledge_relationship_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_graph_projection_checkpoint" (
    "projection_name" VARCHAR(100) NOT NULL,
    "last_event_id" UUID,
    "status" VARCHAR(16) NOT NULL DEFAULT 'idle',
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "knowledge_graph_projection_checkpoint_pkey" PRIMARY KEY ("projection_name")
);

-- CreateTable
CREATE TABLE "event_log_entry" (
    "id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "workspace_id" UUID,
    "aggregate_type" VARCHAR(64) NOT NULL,
    "aggregate_id" UUID NOT NULL,
    "event_type" VARCHAR(150) NOT NULL,
    "event_version" INTEGER NOT NULL DEFAULT 1,
    "payload" JSONB NOT NULL,
    "metadata" JSONB,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,
    "recorded_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sequence" BIGSERIAL NOT NULL,

    CONSTRAINT "event_log_entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "destination" VARCHAR(64) NOT NULL DEFAULT 'graph-projector',
    "status" VARCHAR(16) NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_attempt_at" TIMESTAMPTZ(6),
    "dispatched_at" TIMESTAMPTZ(6),

    CONSTRAINT "outbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "knowledge_domain_organisation_id_idx" ON "knowledge_domain"("organisation_id");

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_domain_workspace_id_key_key" ON "knowledge_domain"("workspace_id", "key");

-- CreateIndex
CREATE INDEX "knowledge_entity_workspace_id_entity_type_idx" ON "knowledge_entity"("workspace_id", "entity_type");

-- CreateIndex
CREATE INDEX "knowledge_entity_organisation_id_idx" ON "knowledge_entity"("organisation_id");

-- CreateIndex
CREATE INDEX "knowledge_entity_merged_into_id_idx" ON "knowledge_entity"("merged_into_id");

-- CreateIndex
CREATE INDEX "entity_alias_source_evidence_id_idx" ON "entity_alias"("source_evidence_id");

-- CreateIndex
CREATE UNIQUE INDEX "entity_alias_entity_id_alias_text_language_key" ON "entity_alias"("entity_id", "alias_text", "language");

-- CreateIndex
CREATE INDEX "knowledge_entity_merge_log_organisation_id_idx" ON "knowledge_entity_merge_log"("organisation_id");

-- CreateIndex
CREATE INDEX "knowledge_entity_merge_log_surviving_entity_id_idx" ON "knowledge_entity_merge_log"("surviving_entity_id");

-- CreateIndex
CREATE INDEX "knowledge_entity_merge_log_merged_entity_id_idx" ON "knowledge_entity_merge_log"("merged_entity_id");

-- CreateIndex
CREATE INDEX "knowledge_candidate_assertion_organisation_id_idx" ON "knowledge_candidate_assertion"("organisation_id");

-- CreateIndex
CREATE INDEX "knowledge_candidate_assertion_workspace_id_status_idx" ON "knowledge_candidate_assertion"("workspace_id", "status");

-- CreateIndex
CREATE INDEX "knowledge_candidate_assertion_knowledge_domain_id_idx" ON "knowledge_candidate_assertion"("knowledge_domain_id");

-- CreateIndex
CREATE INDEX "knowledge_review_decision_candidate_id_idx" ON "knowledge_review_decision"("candidate_id");

-- CreateIndex
CREATE INDEX "knowledge_provenance_chain_candidate_id_idx" ON "knowledge_provenance_chain"("candidate_id");

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_assertion_provenance_chain_id_key" ON "knowledge_assertion"("provenance_chain_id");

-- CreateIndex
CREATE INDEX "knowledge_assertion_organisation_id_idx" ON "knowledge_assertion"("organisation_id");

-- CreateIndex
CREATE INDEX "knowledge_assertion_workspace_id_lifecycle_state_idx" ON "knowledge_assertion"("workspace_id", "lifecycle_state");

-- CreateIndex
CREATE INDEX "knowledge_assertion_knowledge_domain_id_idx" ON "knowledge_assertion"("knowledge_domain_id");

-- CreateIndex
CREATE INDEX "knowledge_assertion_candidate_id_idx" ON "knowledge_assertion"("candidate_id");

-- CreateIndex
CREATE INDEX "knowledge_assertion_group_attribution_id_idx" ON "knowledge_assertion"("group_attribution_id");

-- CreateIndex
CREATE INDEX "knowledge_entity_attribute_entity_id_idx" ON "knowledge_entity_attribute"("entity_id");

-- CreateIndex
CREATE INDEX "knowledge_entity_attribute_assertion_id_idx" ON "knowledge_entity_attribute"("assertion_id");

-- CreateIndex
CREATE INDEX "knowledge_relationship_organisation_id_idx" ON "knowledge_relationship"("organisation_id");

-- CreateIndex
CREATE INDEX "knowledge_relationship_from_entity_id_idx" ON "knowledge_relationship"("from_entity_id");

-- CreateIndex
CREATE INDEX "knowledge_relationship_to_entity_id_idx" ON "knowledge_relationship"("to_entity_id");

-- CreateIndex
CREATE INDEX "knowledge_relationship_relationship_type_idx" ON "knowledge_relationship"("relationship_type");

-- CreateIndex
CREATE INDEX "knowledge_relationship_assertion_id_idx" ON "knowledge_relationship"("assertion_id");

-- CreateIndex
CREATE INDEX "event_log_entry_organisation_id_idx" ON "event_log_entry"("organisation_id");

-- CreateIndex
CREATE INDEX "event_log_entry_aggregate_type_aggregate_id_idx" ON "event_log_entry"("aggregate_type", "aggregate_id");

-- CreateIndex
CREATE INDEX "event_log_entry_event_type_idx" ON "event_log_entry"("event_type");

-- CreateIndex
CREATE UNIQUE INDEX "outbox_event_id_key" ON "outbox"("event_id");

-- CreateIndex
CREATE INDEX "outbox_destination_status_idx" ON "outbox"("destination", "status");

-- AddForeignKey
ALTER TABLE "knowledge_domain" ADD CONSTRAINT "knowledge_domain_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_domain" ADD CONSTRAINT "knowledge_domain_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_domain" ADD CONSTRAINT "knowledge_domain_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_entity" ADD CONSTRAINT "knowledge_entity_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_entity" ADD CONSTRAINT "knowledge_entity_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_entity" ADD CONSTRAINT "knowledge_entity_merged_into_id_fkey" FOREIGN KEY ("merged_into_id") REFERENCES "knowledge_entity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_entity" ADD CONSTRAINT "knowledge_entity_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entity_alias" ADD CONSTRAINT "entity_alias_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "knowledge_entity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entity_alias" ADD CONSTRAINT "entity_alias_source_evidence_id_fkey" FOREIGN KEY ("source_evidence_id") REFERENCES "evidence"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entity_alias" ADD CONSTRAINT "entity_alias_contributed_by_id_fkey" FOREIGN KEY ("contributed_by_id") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_entity_merge_log" ADD CONSTRAINT "knowledge_entity_merge_log_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_entity_merge_log" ADD CONSTRAINT "knowledge_entity_merge_log_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_entity_merge_log" ADD CONSTRAINT "knowledge_entity_merge_log_surviving_entity_id_fkey" FOREIGN KEY ("surviving_entity_id") REFERENCES "knowledge_entity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_entity_merge_log" ADD CONSTRAINT "knowledge_entity_merge_log_merged_entity_id_fkey" FOREIGN KEY ("merged_entity_id") REFERENCES "knowledge_entity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_entity_merge_log" ADD CONSTRAINT "knowledge_entity_merge_log_decided_by_id_fkey" FOREIGN KEY ("decided_by_id") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_candidate_assertion" ADD CONSTRAINT "knowledge_candidate_assertion_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_candidate_assertion" ADD CONSTRAINT "knowledge_candidate_assertion_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_candidate_assertion" ADD CONSTRAINT "knowledge_candidate_assertion_knowledge_domain_id_fkey" FOREIGN KEY ("knowledge_domain_id") REFERENCES "knowledge_domain"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_candidate_assertion" ADD CONSTRAINT "knowledge_candidate_assertion_proposed_by_id_fkey" FOREIGN KEY ("proposed_by_id") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_candidate_assertion" ADD CONSTRAINT "knowledge_candidate_assertion_superseded_by_candidate_id_fkey" FOREIGN KEY ("superseded_by_candidate_id") REFERENCES "knowledge_candidate_assertion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_review_decision" ADD CONSTRAINT "knowledge_review_decision_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "knowledge_candidate_assertion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_review_decision" ADD CONSTRAINT "knowledge_review_decision_reviewer_actor_id_fkey" FOREIGN KEY ("reviewer_actor_id") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_provenance_chain" ADD CONSTRAINT "knowledge_provenance_chain_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "knowledge_candidate_assertion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_provenance_chain" ADD CONSTRAINT "knowledge_provenance_chain_confirmed_by_actor_id_fkey" FOREIGN KEY ("confirmed_by_actor_id") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_assertion" ADD CONSTRAINT "knowledge_assertion_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_assertion" ADD CONSTRAINT "knowledge_assertion_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_assertion" ADD CONSTRAINT "knowledge_assertion_knowledge_domain_id_fkey" FOREIGN KEY ("knowledge_domain_id") REFERENCES "knowledge_domain"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_assertion" ADD CONSTRAINT "knowledge_assertion_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "knowledge_candidate_assertion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_assertion" ADD CONSTRAINT "knowledge_assertion_provenance_chain_id_fkey" FOREIGN KEY ("provenance_chain_id") REFERENCES "knowledge_provenance_chain"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_assertion" ADD CONSTRAINT "knowledge_assertion_group_attribution_id_fkey" FOREIGN KEY ("group_attribution_id") REFERENCES "knowledge_entity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_assertion" ADD CONSTRAINT "knowledge_assertion_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_entity_attribute" ADD CONSTRAINT "knowledge_entity_attribute_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "knowledge_entity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_entity_attribute" ADD CONSTRAINT "knowledge_entity_attribute_assertion_id_fkey" FOREIGN KEY ("assertion_id") REFERENCES "knowledge_assertion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_entity_attribute" ADD CONSTRAINT "knowledge_entity_attribute_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_relationship" ADD CONSTRAINT "knowledge_relationship_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_relationship" ADD CONSTRAINT "knowledge_relationship_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_relationship" ADD CONSTRAINT "knowledge_relationship_from_entity_id_fkey" FOREIGN KEY ("from_entity_id") REFERENCES "knowledge_entity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_relationship" ADD CONSTRAINT "knowledge_relationship_to_entity_id_fkey" FOREIGN KEY ("to_entity_id") REFERENCES "knowledge_entity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_relationship" ADD CONSTRAINT "knowledge_relationship_relationship_type_fkey" FOREIGN KEY ("relationship_type") REFERENCES "relationship_type_definition"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_relationship" ADD CONSTRAINT "knowledge_relationship_assertion_id_fkey" FOREIGN KEY ("assertion_id") REFERENCES "knowledge_assertion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_relationship" ADD CONSTRAINT "knowledge_relationship_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "actor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outbox" ADD CONSTRAINT "outbox_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "event_log_entry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CheckConstraint
--
-- "AI never creates primary evidence" and ADR-0012's non-nullable provenance
-- requirement, enforced at the database level (defence in depth, matching
-- this schema's tenancy convention of enforcing structural guarantees in
-- more than one layer) — not only in packages/domain, which the database
-- cannot see. These two constraints are the load-bearing exception to this
-- schema's "VarChar, not an enum" convention for vocabulary columns
-- (Evidence.evidenceType's doc comment): they check a structural provenance
-- guarantee, not a closed vocabulary, so they stay.
--
-- Deliberately `cardinality(...)`, not `array_length(..., 1)`: Postgres's
-- `array_length` returns NULL (not 0) for an empty array, and a CHECK
-- constraint treats a NULL condition result as satisfied, not violated — so
-- `array_length(source_evidence_ids, 1) >= 1` silently ADMITS an empty
-- array, the exact row this constraint exists to reject. `cardinality`
-- returns 0 for an empty array, so `>= 1` behaves as written. Caught by a
-- functional test inserting an empty array directly — do not "simplify"
-- this back to `array_length` without re-running that test.
ALTER TABLE "knowledge_candidate_assertion"
  ADD CONSTRAINT "knowledge_candidate_assertion_requires_evidence"
  CHECK (source_evidence_ids IS NOT NULL AND cardinality(source_evidence_ids) >= 1);

ALTER TABLE "knowledge_candidate_assertion"
  ADD CONSTRAINT "knowledge_candidate_assertion_ai_model_requires_version"
  CHECK (extraction_method <> 'ai_model' OR (extraction_model IS NOT NULL AND extraction_model_version IS NOT NULL));

ALTER TABLE "knowledge_provenance_chain"
  ADD CONSTRAINT "knowledge_provenance_chain_requires_evidence"
  CHECK (source_evidence_ids IS NOT NULL AND cardinality(source_evidence_ids) >= 1);

ALTER TABLE "knowledge_provenance_chain"
  ADD CONSTRAINT "knowledge_provenance_chain_ai_model_requires_version"
  CHECK (extraction_method <> 'ai_model' OR (extraction_model IS NOT NULL AND extraction_model_version IS NOT NULL));
-- Seed the controlled relationship vocabulary (ADR-0026 point 5) —
-- generated from packages/domain/src/relationship-vocabulary.ts's
-- RELATIONSHIP_TYPE_SEEDS, the single source both this migration and
-- any future consumer read from. Without these rows, no relationship
-- candidate can ever be approved (the FK on knowledge_relationship
-- .relationship_type would reject every code) — this is foundational
-- reference data, not sample/dev data, so it ships in the migration
-- itself rather than prisma/seed.ts (which is synthetic dev fixtures
-- only, per that file's own header comment).
INSERT INTO "relationship_type_definition" ("code", "category", "description", "is_core", "inverse_code", "ontology_version") VALUES
  ('ATTENDED', 'participation', 'Attended a meeting.', true, NULL, '0.1.0'),
  ('SPOKE_AT', 'participation', 'Spoke at a meeting.', true, NULL, '0.1.0'),
  ('CONVENED', 'participation', 'Convened a meeting.', true, NULL, '0.1.0'),
  ('CONSULTED_IN', 'participation', 'A community was consulted in a meeting.', true, NULL, '0.1.0'),
  ('REPRESENTED', 'participation', 'Represented another party.', true, NULL, '0.1.0'),
  ('CHAIRED', 'participation', 'Chaired a meeting.', true, NULL, '0.1.0'),
  ('APOLOGISED_FOR', 'participation', 'Sent apologies for a meeting.', true, NULL, '0.1.0'),
  ('MEMBER_OF', 'affiliation', 'Is a member of.', true, NULL, '0.1.0'),
  ('BELONGS_TO', 'affiliation', 'Belongs to a community.', true, NULL, '0.1.0'),
  ('EMPLOYED_BY', 'affiliation', 'Is employed by.', true, NULL, '0.1.0'),
  ('PART_OF', 'affiliation', 'Is part of.', true, NULL, '0.1.0'),
  ('CUSTODIAN_OF', 'affiliation', 'Is the custodian of a place or body of knowledge.', true, NULL, '0.1.0'),
  ('PRODUCED', 'causation', 'Produced a decision.', true, NULL, '0.1.0'),
  ('GENERATED', 'causation', 'Generated an action.', true, NULL, '0.1.0'),
  ('CREATED', 'causation', 'Created a commitment.', true, NULL, '0.1.0'),
  ('RAISED', 'causation', 'Raised a risk.', true, NULL, '0.1.0'),
  ('TRIGGERED', 'causation', 'Triggered a subsequent event.', true, NULL, '0.1.0'),
  ('SUPERSEDES', 'causation', 'Supersedes an earlier assertion or entity.', true, NULL, '0.1.0'),
  ('SUPPORTED_BY', 'evidential', 'Is supported by a piece of evidence.', true, 'SUPPORTS', '0.1.0'),
  ('CONTRADICTED_BY', 'evidential', 'Is contradicted by another assertion.', true, 'CONTRADICTS', '0.1.0'),
  ('CITES', 'evidential', 'Cites a source.', true, NULL, '0.1.0'),
  ('DERIVED_FROM', 'evidential', 'Was derived from a source.', true, NULL, '0.1.0'),
  ('OWNS', 'accountability', 'Owns an action.', true, NULL, '0.1.0'),
  ('ACCOUNTABLE_FOR', 'accountability', 'Is accountable for a project.', true, NULL, '0.1.0'),
  ('PROMISED', 'accountability', 'Made a commitment.', true, NULL, '0.1.0'),
  ('OWED_TO', 'accountability', 'A commitment is owed to a community.', true, NULL, '0.1.0'),
  ('DELEGATED_TO', 'accountability', 'Delegated to.', true, NULL, '0.1.0'),
  ('AFFECTED_BY', 'impact', 'Is affected by a policy.', true, NULL, '0.1.0'),
  ('THREATENS', 'impact', 'A risk threatens a project.', true, NULL, '0.1.0'),
  ('MITIGATED_BY', 'impact', 'Is mitigated by an action.', true, NULL, '0.1.0'),
  ('BENEFITS', 'impact', 'Benefits a party.', true, NULL, '0.1.0'),
  ('DISCUSSED', 'thematic', 'A meeting discussed a topic.', true, NULL, '0.1.0'),
  ('ABOUT', 'thematic', 'Is about a topic.', true, NULL, '0.1.0'),
  ('RELATED_TO', 'thematic', 'Is related to.', true, NULL, '0.1.0'),
  ('BROADER_THAN', 'thematic', 'Is a broader topic than.', true, 'NARROWER_THAN', '0.1.0'),
  ('NARROWER_THAN', 'thematic', 'Is a narrower topic than.', true, NULL, '0.1.0'),
  ('LOCATED_IN', 'spatial', 'Is located within a place.', true, NULL, '0.1.0'),
  ('ADJACENT_TO', 'spatial', 'Is adjacent to.', true, NULL, '0.1.0'),
  ('WITHIN', 'spatial', 'Is within.', true, NULL, '0.1.0'),
  ('FULFILLED_BY', 'lifecycle', 'A commitment is fulfilled by an action.', true, NULL, '0.1.0'),
  ('IMPLEMENTS', 'lifecycle', 'A decision implements a policy.', true, NULL, '0.1.0'),
  ('DELIVERS', 'lifecycle', 'A project delivers a policy.', true, NULL, '0.1.0'),
  ('BLOCKS', 'lifecycle', 'Blocks progress on something.', true, NULL, '0.1.0'),
  ('CONTRADICTS', 'evidential', 'Institutions contradict themselves; surfaced to a human, never silently resolved.', true, 'CONTRADICTED_BY', '0.1.0'),
  ('MENTIONS', 'evidential', 'Evidence mentions an entity.', false, NULL, '0.1.0'),
  ('QUALIFIES', 'thematic', 'Qualifies or adds a condition to.', false, NULL, '0.1.0'),
  ('REQUIRES', 'accountability', 'Requires another thing to hold.', false, NULL, '0.1.0'),
  ('DEPENDS_ON', 'lifecycle', 'Depends on.', false, NULL, '0.1.0'),
  ('PROPOSES', 'causation', 'Proposes a decision or action.', false, NULL, '0.1.0'),
  ('RESPONDS_TO', 'thematic', 'Responds to a prior statement.', false, NULL, '0.1.0'),
  ('DECIDED_BY', 'accountability', 'Was decided by an authorised party.', false, NULL, '0.1.0'),
  ('RESULTED_IN', 'causation', 'Resulted in an outcome.', false, NULL, '0.1.0'),
  ('EVIDENCED_BY', 'evidential', 'Is evidenced by (a plain-language alias of SUPPORTED_BY, kept because facilitator UX asked for it by this name).', false, NULL, '0.1.0'),
  ('RAISED_BY', 'accountability', 'Was raised by a person or group.', false, NULL, '0.1.0'),
  ('AGREED_BY', 'accountability', 'Was agreed by a person or group.', false, NULL, '0.1.0'),
  ('DISPUTED_BY', 'perspective', 'Is disputed by a person or group.', false, NULL, '0.1.0'),
  ('CONTESTED_IN', 'perspective', 'A proposal or assertion is contested in a specific session — the disagreement-preservation edge (ADR-0026 point 6).', false, NULL, '0.1.0');

