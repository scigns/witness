-- Widen `report_source.source_type`'s CHECK constraint.
--
-- packages/domain/src/report-source.ts's REPORT_SOURCE_TYPES gained two new
-- values this phase — 'transcript' and 'session_summary' — but this
-- constraint (not expressible in schema.prisma, so not caught by
-- `prisma migrate dev`'s diff) still only admitted the original four. Every
-- attempt to draw a confirmed transcript or session summary into a report
-- failed the write against real Postgres with a 23514 check-violation, found
-- live: creating a report on a session with a confirmed transcript.
--
-- Not caught by the service tests, for the same reason
-- 20260809120000_widen_audit_subject_type wasn't: the in-memory Prisma
-- double has no constraints of its own to violate.
ALTER TABLE "report_source" DROP CONSTRAINT "report_source_type_check";

ALTER TABLE "report_source" ADD CONSTRAINT "report_source_type_check" CHECK (
    "source_type" IN ('evidence', 'decision', 'commitment', 'action_item', 'transcript', 'session_summary')
);
