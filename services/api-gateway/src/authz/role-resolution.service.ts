/**
 * Resolves a signed-in user's *effective grant tiers* from live
 * `RoleAssignment`/`OrganisationMembership`/`WorkspaceMembership` data —
 * shared by `SessionAuthenticator` (global tiers, for the
 * request-authentication step) and `PolicyEnforcementService` (scoped
 * tiers, for the per-request authorisation decision this milestone adds).
 *
 * Two different questions, two different answers from the same underlying
 * `RoleAssignment` rows:
 *
 * - **Global** ("what can this user do anywhere, unscoped") flattens every
 *   assignment across every organisation and workspace into one tier set,
 *   and excludes `admin` from an *organisation-* or *workspace-scoped*
 *   `RoleAssignment` — that kind means "administers organisation/workspace X
 *   specifically", and must never grant the *global*, unscoped actions
 *   (`organisation:create`, `user:create`) that have no organisation or
 *   workspace to check against. This was a deliberate fail-closed gap
 *   ("nothing in the accepted domain model says who may create an
 *   organisation from nothing") until `'platform'`-scope `RoleAssignment`
 *   answered that question directly: a `'platform'`-scope `admin` row *does*
 *   grant the global `admin` tier, because that scope means exactly "may act
 *   with no organisation or workspace to check against" and nothing else.
 *   Only `prisma/bootstrap.ts` creates one, for the deployment's first
 *   administrator.
 *
 * - **Scoped** ("what can this user do in *this specific* organisation or
 *   workspace") looks only at assignments matching that exact scope (a
 *   workspace scope also honours an assignment on the workspace's *parent*
 *   organisation — see `scopedGrantTiers` — matching the existing
 *   "organisation administrator manages what is under their organisation"
 *   reading from `BUILD_ROADMAP.md` Milestone 1.1), and DOES include
 *   `admin`, because within that one bounded scope "administers this
 *   organisation" is exactly the grant an `admin` `RoleAssignment` promises.
 *   This is the part of the fail-closed gap this milestone closes.
 */

import { Injectable } from '@nestjs/common';

import { isInGoodStanding, type MembershipState, type WitnessRole } from '@witness/domain';

import { PrismaService } from '../infrastructure/prisma.service.js';

export type ResourceScope =
  | { readonly type: 'global' }
  | { readonly type: 'organisation'; readonly organisationId: string }
  | { readonly type: 'workspace'; readonly workspaceId: string };

/**
 * `WitnessRole` (the six product-facing roles, `packages/domain/src/role.ts`)
 * → the request-time grant tier it carries (`packages/policy/policy.csv`).
 * `facilitator`/`participant` collapse onto `contributor`/`reader` because
 * neither has session-specific permissions of its own yet (Co-design
 * Sessions, Milestone 2, do not exist). `admin` maps to itself here — see
 * the file header for why the *global* resolution excludes it anyway.
 */
const ROLE_TO_TIER: Readonly<Record<WitnessRole, string>> = Object.freeze({
  admin: 'admin',
  facilitator: 'contributor',
  contributor: 'contributor',
  reviewer: 'reviewer',
  participant: 'reader',
  reader: 'reader',
});

@Injectable()
export class RoleResolutionService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Every tier this user holds anywhere. Used for actions with no
   * organisation or workspace to scope to (`record:*`, `user:*`,
   * `role:read`, `organisation:create`).
   */
  async globalGrantTiers(userId: string): Promise<string[]> {
    const assignments = await this.prisma.roleAssignment.findMany({
      where: { userId },
      select: { role: true, organisationId: true, workspaceId: true },
    });

    if (assignments.length === 0) return [];

    const { goodOrganisations, goodWorkspaces } = await this.goodStandingSets(userId, assignments);

    const tiers = new Set<string>();
    for (const assignment of assignments) {
      if (!this.backingMembershipInGoodStanding(assignment, goodOrganisations, goodWorkspaces)) {
        continue;
      }
      const role = assignment.role as WitnessRole;
      const isPlatformScope = assignment.organisationId === null && assignment.workspaceId === null;

      if (isPlatformScope) {
        // The one case global resolution grants real `admin` — see the file
        // header. `role_assignment_scope_check` guarantees a row reaching
        // here with both ids null has `scopeType = 'platform'`.
        tiers.add(ROLE_TO_TIER[role]);
        continue;
      }

      // An organisation- or workspace-scoped `admin` assignment still counts
      // as *reader* here, though, rather than being dropped entirely.
      // Dropping it left anyone whose only role is an organisation
      // administrator holding no global tier at all, which denied them
      // `organisation:read`, `workspace:read` and `record:read` — the
      // membership-filtered list endpoints, and every picker in the UI built
      // on them. An organisation's administrator could not open the
      // organisations page or choose an organisation when creating a
      // workspace. Nothing was leaked by the denial and nothing is leaked by
      // lifting it: those endpoints return only the caller's own memberships
      // either way. This surfaced the first time the application was driven
      // through a real signed-in session rather than the development header,
      // which resolves a flat global tier and so never reached this branch.
      tiers.add(role === 'admin' ? 'reader' : ROLE_TO_TIER[role]);
    }

    return [...tiers];
  }

  /** Platform-only authority for privileged internal operations such as settlement. */
  async platformGrantTiers(userId: string): Promise<string[]> {
    const assignments = await this.prisma.roleAssignment.findMany({
      where: {
        userId,
        scopeType: 'platform',
        organisationId: null,
        workspaceId: null,
      },
      select: { role: true },
    });
    return [
      ...new Set(assignments.map((assignment) => ROLE_TO_TIER[assignment.role as WitnessRole])),
    ];
  }

  /**
   * Every tier this user holds in exactly this scope — `admin` included.
   * A workspace scope also honours a `RoleAssignment` on the workspace's
   * *parent* organisation (an organisation administrator's remit extends to
   * the workspaces under their organisation).
   *
   * There is deliberately no `'global'` case here — `admin` must never be
   * included for an unscoped decision, and `globalGrantTiers` is the only
   * method allowed to answer that question. Narrowing this method's scope
   * parameter to exclude `'global'` makes that a compile-time guarantee
   * rather than a runtime branch someone could get wrong later.
   */
  async scopedGrantTiers(
    userId: string,
    scope: Exclude<ResourceScope, { type: 'global' }>,
  ): Promise<string[]> {
    if (scope.type === 'organisation') {
      return this.tiersForOrganisation(userId, scope.organisationId);
    }

    return this.tiersForWorkspace(userId, scope.workspaceId);
  }

  private async tiersForOrganisation(userId: string, organisationId: string): Promise<string[]> {
    const [assignments, membership] = await Promise.all([
      this.prisma.roleAssignment.findMany({
        where: { userId, organisationId },
        select: { role: true },
      }),
      this.prisma.organisationMembership.findUnique({
        where: { organisationId_userId: { organisationId, userId } },
        select: { state: true },
      }),
    ]);

    if (assignments.length === 0) return [];
    if (membership === null || !isInGoodStanding(membership.state as MembershipState)) return [];

    return [...new Set(assignments.map((a) => ROLE_TO_TIER[a.role as WitnessRole]))];
  }

  private async tiersForWorkspace(userId: string, workspaceId: string): Promise<string[]> {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { organisationId: true },
    });
    if (workspace === null) return [];

    const [
      workspaceAssignments,
      workspaceMembership,
      organisationAssignments,
      organisationMembership,
    ] = await Promise.all([
      this.prisma.roleAssignment.findMany({
        where: { userId, workspaceId },
        select: { role: true },
      }),
      this.prisma.workspaceMembership.findUnique({
        where: { workspaceId_userId: { workspaceId, userId } },
        select: { state: true },
      }),
      this.prisma.roleAssignment.findMany({
        where: { userId, organisationId: workspace.organisationId },
        select: { role: true },
      }),
      this.prisma.organisationMembership.findUnique({
        where: {
          organisationId_userId: { organisationId: workspace.organisationId, userId },
        },
        select: { state: true },
      }),
    ]);

    const tiers = new Set<string>();

    if (
      workspaceAssignments.length > 0 &&
      workspaceMembership !== null &&
      isInGoodStanding(workspaceMembership.state as MembershipState)
    ) {
      for (const a of workspaceAssignments) tiers.add(ROLE_TO_TIER[a.role as WitnessRole]);
    }

    if (
      organisationAssignments.length > 0 &&
      organisationMembership !== null &&
      isInGoodStanding(organisationMembership.state as MembershipState)
    ) {
      for (const a of organisationAssignments) tiers.add(ROLE_TO_TIER[a.role as WitnessRole]);
    }

    return [...tiers];
  }

  private async goodStandingSets(
    userId: string,
    assignments: { organisationId: string | null; workspaceId: string | null }[],
  ): Promise<{ goodOrganisations: Set<string>; goodWorkspaces: Set<string> }> {
    const organisationIds = [
      ...new Set(
        assignments.map((a) => a.organisationId).filter((id): id is string => id !== null),
      ),
    ];
    const workspaceIds = [
      ...new Set(assignments.map((a) => a.workspaceId).filter((id): id is string => id !== null)),
    ];

    const [organisationMemberships, workspaceMemberships] = await Promise.all([
      organisationIds.length === 0
        ? Promise.resolve([])
        : this.prisma.organisationMembership.findMany({
            where: { userId, organisationId: { in: organisationIds } },
            select: { organisationId: true, state: true },
          }),
      workspaceIds.length === 0
        ? Promise.resolve([])
        : this.prisma.workspaceMembership.findMany({
            where: { userId, workspaceId: { in: workspaceIds } },
            select: { workspaceId: true, state: true },
          }),
    ]);

    return {
      goodOrganisations: new Set(
        organisationMemberships
          .filter((m) => isInGoodStanding(m.state as MembershipState))
          .map((m) => m.organisationId),
      ),
      goodWorkspaces: new Set(
        workspaceMemberships
          .filter((m) => isInGoodStanding(m.state as MembershipState))
          .map((m) => m.workspaceId),
      ),
    };
  }

  private backingMembershipInGoodStanding(
    assignment: { organisationId: string | null; workspaceId: string | null },
    goodOrganisations: Set<string>,
    goodWorkspaces: Set<string>,
  ): boolean {
    if (assignment.organisationId !== null) return goodOrganisations.has(assignment.organisationId);
    if (assignment.workspaceId !== null) return goodWorkspaces.has(assignment.workspaceId);
    // Both null: platform scope. There is no membership concept to check —
    // the assignment itself is the entire grant.
    return true;
  }
}
