-- Widen knowledge_candidate_assertion.status from VARCHAR(16) to VARCHAR(32).
--
-- Phase 3 added two longer CandidateAssertionStatus values —
-- 'needs_clarification' (20 chars) and 'pending_community_validation'
-- (29 chars) — that do not fit VARCHAR(16), the width the original
-- 20260919090741_evidence_knowledge_graph migration gave this column when
-- the only values were pending/confirmed/corrected/rejected/superseded/
-- expired. Widening only, no data migration needed: every existing value
-- already fits the new width, and this is purely additive (ADR-0013 —
-- Postgres remains authoritative; this does not touch Neo4j).
--
-- Rollback: ALTER TABLE "knowledge_candidate_assertion" ALTER COLUMN
-- "status" TYPE VARCHAR(16); — safe only if no row has since taken one of
-- the two longer values.

ALTER TABLE "knowledge_candidate_assertion" ALTER COLUMN "status" TYPE VARCHAR(32);
