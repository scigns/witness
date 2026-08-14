-- Adds 'platform' as a third role_assignment scope, alongside the existing
-- 'organisation' xor 'workspace'. Unlike those two, a platform-scope
-- assignment has no organisation or workspace to check membership against —
-- it answers a different question ("can this user act with no scope at all,
-- e.g. create an organisation from nothing") that role-resolution.service.ts
-- previously left unanswerable by design. See that file's header and
-- services/api-gateway/prisma/bootstrap.ts, the only place that creates one.

ALTER TABLE "role_assignment" DROP CONSTRAINT "role_assignment_scope_check";

ALTER TABLE "role_assignment" ADD CONSTRAINT "role_assignment_scope_check" CHECK (
    ("scope_type" = 'organisation' AND "organisation_id" IS NOT NULL AND "workspace_id" IS NULL)
    OR
    ("scope_type" = 'workspace' AND "workspace_id" IS NOT NULL AND "organisation_id" IS NULL)
    OR
    ("scope_type" = 'platform' AND "organisation_id" IS NULL AND "workspace_id" IS NULL)
);

-- organisation_id/workspace_id being NULL for every platform-scope row means
-- the existing @@unique([organisationId, userId]) / @@unique([workspaceId,
-- userId]) constraints do not apply to it (Postgres treats NULL as distinct
-- in a unique index), so a dedicated partial index is what actually keeps
-- one platform assignment per user.
CREATE UNIQUE INDEX "role_assignment_platform_user_key" ON "role_assignment"("user_id")
    WHERE "scope_type" = 'platform';
