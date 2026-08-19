'use client';

/**
 * Manage program — membership administration, moved out of Program Home
 * (Client-Ready Experience overhaul, Phase 18: facilitator/admin
 * capabilities live under "Manage program", not the main participant
 * landing page). Same functionality as the page this replaced; only its
 * position in the information architecture changed.
 *
 * The "add to workspace" list is restricted to organisation members whose
 * organisation membership is in good standing (`invited` or `active`) — the
 * same eligibility rule the API enforces server-side
 * (`packages/domain/src/workspace-membership.ts`). Filtering the dropdown to
 * only eligible users is a convenience; it is not what makes the rule real —
 * the API would refuse an ineligible user even if this filter had a bug.
 *
 * The readiness checklist (Client-Ready Experience overhaul, Phase 19: "Ready
 * to run") is read-only signal, not a gate — a facilitator can run a session
 * with an incomplete program if that's genuinely what they need. Each row
 * links straight to the screen that would resolve it.
 */

import Link from 'next/link';
import { use, useCallback, useEffect, useState } from 'react';

import type {
  AgendaItemView,
  CoDesignSessionSummary,
  MembershipAction,
  MembershipState,
  OrganisationMembershipView,
  OrganisationSummary,
  ResourceView,
  RoleAssignmentView,
  RoleDefinition,
  WitnessRole,
  WorkspaceMembershipView,
  WorkspaceSummary,
} from '@witness/contracts';

import { api, ApiError } from '@/lib/api';
import { useSession } from '@/lib/session';
import {
  Button,
  Card,
  ErrorNotice,
  MembershipStateBadge,
  RoleAssignmentControl,
} from '@/components/ui';

interface ReadinessRow {
  label: string;
  ready: boolean;
  href: string;
  detail: string;
}

const ACTION_LABELS: Record<MembershipAction['action'], string> = {
  activate: 'Activate',
  suspend: 'Suspend access',
  revoke: 'Revoke membership',
};

const GOOD_STANDING: ReadonlySet<MembershipState> = new Set<MembershipState>(['invited', 'active']);

export default function ManageWorkspacePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user, ready } = useSession();

  const [workspace, setWorkspace] = useState<WorkspaceSummary | null>(null);
  const [organisation, setOrganisation] = useState<OrganisationSummary | null>(null);
  const [memberships, setMemberships] = useState<WorkspaceMembershipView[]>([]);
  const [organisationMembers, setOrganisationMembers] = useState<OrganisationMembershipView[]>([]);
  const [roles, setRoles] = useState<RoleDefinition[]>([]);
  const [roleAssignments, setRoleAssignments] = useState<Record<string, RoleAssignmentView>>({});
  const [selectedUserId, setSelectedUserId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  // `workspace_membership:read`/`organisation_membership:read` are
  // admin-only (least privilege, see `role-grants.ts`) — a facilitator
  // (`contributor`) genuinely can't manage membership here even though the
  // rest of this page (readiness checklist, agenda, resources) is theirs to
  // use. Degrading just the membership sections, rather than failing the
  // whole page, keeps this page usable for the role it's documented for.
  const [membershipsForbidden, setMembershipsForbidden] = useState(false);

  const [sessions, setSessions] = useState<CoDesignSessionSummary[]>([]);
  const [agendaItems, setAgendaItems] = useState<AgendaItemView[]>([]);
  const [resources, setResources] = useState<ResourceView[]>([]);
  const [consentConfigured, setConsentConfigured] = useState(false);

  const load = useCallback(
    async (cancelledRef: { current: boolean }) => {
      try {
        const [
          workspaceResult,
          organisationsResult,
          rolesResult,
          sessionsResult,
          agendaItemsResult,
          resourcesResult,
        ] = await Promise.all([
          api.getWorkspace(id, user),
          api.listOrganisations(user),
          api.listRoles(user),
          api.listSessions(id, user),
          api.listAgendaItems(id, user),
          api.listResources(id, user),
        ]);
        if (cancelledRef.current) return;

        setWorkspace(workspaceResult);
        setOrganisation(
          organisationsResult.organisations.find((o) => o.id === workspaceResult.organisationId) ??
            null,
        );
        setRoles(rolesResult.roles);
        setSessions(sessionsResult.sessions);
        setAgendaItems(agendaItemsResult.agendaItems);
        setResources(resourcesResult.resources);
        setError(null);

        const configuredFlags = await Promise.all(
          sessionsResult.sessions.map((session) =>
            api
              .getSessionConsentConfiguration(id, session.id, user)
              .then(() => true)
              .catch(() => false),
          ),
        );
        if (cancelledRef.current) return;
        setConsentConfigured(configuredFlags.some(Boolean));

        try {
          const membershipsResult = await api.listWorkspaceMemberships(id, user);
          if (cancelledRef.current) return;
          setMemberships(membershipsResult.memberships);

          const [assignments, orgMembersResult] = await Promise.all([
            Promise.all(
              membershipsResult.memberships.map((membership) =>
                api.getWorkspaceRoleAssignment(id, membership.id, user),
              ),
            ),
            api.listOrganisationMemberships(workspaceResult.organisationId, user),
          ]);
          if (cancelledRef.current) return;
          setRoleAssignments(Object.fromEntries(assignments.map((a) => [a.membershipId, a])));
          setOrganisationMembers(orgMembersResult.memberships);
          setMembershipsForbidden(false);
        } catch (membershipsCaught) {
          if (cancelledRef.current) return;
          setMemberships([]);
          setRoleAssignments({});
          setOrganisationMembers([]);
          // A 403 is the expected, silent case for every non-admin role —
          // anything else (network failure, timeout, a real server error)
          // is not the same as "you can't manage this" and must still
          // surface as a real error, not the permission empty-state.
          if (membershipsCaught instanceof ApiError && membershipsCaught.status === 403) {
            setMembershipsForbidden(true);
          } else {
            setMembershipsForbidden(false);
            setError(
              membershipsCaught instanceof ApiError
                ? membershipsCaught.message
                : "Couldn't load this program's membership.",
            );
          }
        }
      } catch (caught) {
        if (cancelledRef.current) return;
        setError(caught instanceof ApiError ? caught.message : 'Something went wrong.');
      } finally {
        if (!cancelledRef.current) setLoading(false);
      }
    },
    [id, user],
  );

  useEffect(() => {
    if (!ready) return;
    const cancelledRef = { current: false };
    void load(cancelledRef);
    return () => {
      cancelledRef.current = true;
    };
  }, [ready, load]);

  const workspaceMemberUserIds = new Set(memberships.map((m) => m.userId));
  const eligibleOrganisationMembers = organisationMembers.filter(
    (member) => GOOD_STANDING.has(member.state) && !workspaceMemberUserIds.has(member.userId),
  );

  const addMember = async () => {
    if (selectedUserId === '') return;
    setBusy(true);
    try {
      await api.addWorkspaceMembership(id, { userId: selectedUserId }, user);
      setSelectedUserId('');
      await load({ current: false });
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  const applyAction = async (membershipId: string, action: MembershipAction['action']) => {
    setBusy(true);
    try {
      await api.transitionWorkspaceMembership(id, membershipId, { action }, user);
      await load({ current: false });
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  const assignRole = async (membershipId: string, role: string) => {
    setBusy(true);
    try {
      await api.assignWorkspaceRole(id, membershipId, { role: role as WitnessRole }, user);
      await load({ current: false });
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  const removeRole = async (membershipId: string) => {
    setBusy(true);
    try {
      await api.removeWorkspaceRole(id, membershipId, user);
      await load({ current: false });
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <p role="status" className="text-[var(--color-ink-muted)]">
        Loading…
      </p>
    );
  }

  if (workspace === null) {
    return (
      <div className="space-y-4">
        <ErrorNotice message={error ?? `No program with id '${id}'.`} />
        <Link href="/workspaces" className="text-sm underline">
          ← Back to programs
        </Link>
      </div>
    );
  }

  const readiness: ReadinessRow[] = [
    {
      label: 'Program details',
      ready: workspace.description !== null && workspace.description.trim() !== '',
      href: `/workspaces/${id}`,
      detail: 'A description helps participants understand what this program is for.',
    },
    {
      label: 'People',
      // `membershipsForbidden` means "unknown", not "zero" — reporting
      // not-ready here would claim no one has joined when the truth is
      // this viewer simply can't see the roster.
      ready: membershipsForbidden || memberships.length > 0,
      // Membership management lives further down this same page (the
      // "Members" section below), not on a separate route — an href back to
      // `/workspaces/${id}/manage` was a self-link that looked like it did
      // nothing when clicked. An in-page anchor actually takes the
      // facilitator to the section this row describes.
      href: '#members-heading',
      detail: membershipsForbidden
        ? "You don't have permission to see who's added."
        : `${memberships.length} member${memberships.length === 1 ? '' : 's'} added.`,
    },
    {
      label: 'Agenda',
      ready: agendaItems.length > 0,
      href: `/workspaces/${id}/agenda`,
      detail: `${agendaItems.length} agenda item${agendaItems.length === 1 ? '' : 's'} added.`,
    },
    {
      label: 'Resources',
      ready: resources.length > 0,
      href: `/workspaces/${id}/resources`,
      detail: `${resources.length} resource${resources.length === 1 ? '' : 's'} shared.`,
    },
    {
      label: 'Consent',
      ready: consentConfigured,
      href:
        sessions[0] !== undefined
          ? `/workspaces/${id}/sessions/${sessions[0].id}/consent-configuration`
          : `/workspaces/${id}/sessions`,
      detail: consentConfigured
        ? 'At least one session has consent configured.'
        : 'No session has a consent configuration yet.',
    },
    {
      label: 'Sessions',
      ready: sessions.length > 0,
      href: `/workspaces/${id}/sessions`,
      detail: `${sessions.length} session${sessions.length === 1 ? '' : 's'} created.`,
    },
  ];
  const readyCount = readiness.filter((row) => row.ready).length;

  return (
    <div className="space-y-6">
      <Link href={`/workspaces/${id}`} className="inline-block text-sm underline">
        ← Back to {workspace.name}
      </Link>

      {error !== null && <ErrorNotice message={error} />}

      <div>
        <p className="text-sm text-[var(--color-ink-muted)]">Manage program</p>
        <h1 className="text-2xl font-semibold tracking-tight">{workspace.name}</h1>
        <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
          {organisation === null ? (
            'Organisation: unknown'
          ) : (
            <>
              Organisation:{' '}
              <Link href={`/organisations/${organisation.id}`} className="underline">
                {organisation.name}
              </Link>
            </>
          )}
        </p>
      </div>

      <section aria-labelledby="readiness-heading" className="space-y-3">
        <h2 id="readiness-heading" className="text-lg font-semibold">
          Ready to run ({readyCount} of {readiness.length})
        </h2>
        <Card className="divide-y divide-[var(--color-line)] p-0">
          {readiness.map((row) => (
            <Link
              key={row.label}
              href={row.href}
              className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-[var(--color-accent-soft)]"
            >
              <div className="min-w-0">
                <p className="font-medium">
                  <span aria-hidden="true">{row.ready ? '✓' : '○'}</span> {row.label}
                </p>
                <p className="text-sm text-[var(--color-ink-muted)]">{row.detail}</p>
              </div>
              <span className="shrink-0 text-sm underline">
                {row.ready ? 'Review →' : 'Set up →'}
              </span>
            </Link>
          ))}
        </Card>
      </section>

      <section aria-labelledby="add-member-heading">
        <h2 id="add-member-heading" className="mb-3 text-lg font-semibold">
          Invite an organisation member to this program
        </h2>
        <Card className="space-y-3">
          {membershipsForbidden ? (
            <p className="text-sm text-[var(--color-ink-muted)]">
              You don't have permission to manage program membership. Ask an organisation admin.
            </p>
          ) : eligibleOrganisationMembers.length === 0 ? (
            <p className="text-sm text-[var(--color-ink-muted)]">
              No eligible organisation members. A user must be an invited or active member of{' '}
              {organisation?.name ?? 'this program’s organisation'} before they can be added here.
            </p>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <label htmlFor="userId" className="sr-only">
                User to add
              </label>
              <select
                id="userId"
                value={selectedUserId}
                onChange={(event) => setSelectedUserId(event.target.value)}
                className="rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2"
              >
                <option value="">Choose a user…</option>
                {eligibleOrganisationMembers.map((member) => (
                  <option key={member.userId} value={member.userId}>
                    {member.userDisplayName} ({member.userEmail})
                  </option>
                ))}
              </select>
              <Button
                variant="primary"
                disabled={busy || selectedUserId === ''}
                onClick={() => void addMember()}
              >
                Add to program
              </Button>
            </div>
          )}
        </Card>
      </section>

      <section aria-labelledby="members-heading">
        <h2 id="members-heading" className="mb-3 text-lg font-semibold">
          Members
        </h2>
        {membershipsForbidden ? (
          <Card>
            <p className="text-sm text-[var(--color-ink-muted)]">
              You don't have permission to view program membership. Ask an organisation admin.
            </p>
          </Card>
        ) : memberships.length === 0 ? (
          <Card>
            <p className="text-sm text-[var(--color-ink-muted)]">No members yet.</p>
          </Card>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <caption className="sr-only">Program members and their status</caption>
              <thead>
                <tr className="border-b border-[var(--color-line)]">
                  <th scope="col" className="py-2 pr-4 font-medium">
                    User
                  </th>
                  <th scope="col" className="py-2 pr-4 font-medium">
                    Membership status
                  </th>
                  <th scope="col" className="py-2 pr-4 font-medium">
                    Role
                  </th>
                  <th scope="col" className="py-2 font-medium">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {memberships.map((membership) => {
                  const assignment: RoleAssignmentView = roleAssignments[membership.id] ?? {
                    membershipId: membership.id,
                    userId: membership.userId,
                    userEmail: membership.userEmail,
                    userDisplayName: membership.userDisplayName,
                    role: null,
                    roleLabel: null,
                    permittedActions: [],
                    updatedAt: null,
                  };

                  return (
                    <tr key={membership.id} className="border-b border-[var(--color-line)]">
                      <td className="py-3 pr-4">
                        <div className="font-medium">{membership.userDisplayName}</div>
                        <div className="text-xs text-[var(--color-ink-muted)]">
                          {membership.userEmail}
                        </div>
                      </td>
                      <td className="py-3 pr-4">
                        <MembershipStateBadge state={membership.state} />
                      </td>
                      <td className="py-3 pr-4">
                        <RoleAssignmentControl
                          roles={roles}
                          assignment={assignment}
                          busy={busy}
                          onAssign={(role) => void assignRole(membership.id, role)}
                          onRemove={() => void removeRole(membership.id)}
                        />
                      </td>
                      <td className="py-3">
                        <div className="flex flex-wrap gap-2">
                          {membership.permittedActions.map((action) => (
                            <Button
                              key={action}
                              variant={action === 'revoke' ? 'danger' : 'secondary'}
                              disabled={busy}
                              onClick={() => void applyAction(membership.id, action)}
                            >
                              {ACTION_LABELS[action]}
                            </Button>
                          ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
