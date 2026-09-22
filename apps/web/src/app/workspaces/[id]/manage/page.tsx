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
import { use, useCallback, useEffect, useState, type FormEvent } from 'react';

import type {
  AffiliationType,
  AgendaItemView,
  CoDesignSessionSummary,
  CreateWorkspaceInvitationRequest,
  MembershipAction,
  MembershipState,
  OrganisationMembershipView,
  OrganisationSummary,
  ResourceView,
  RoleAssignmentView,
  RoleDefinition,
  WitnessRole,
  WorkspaceInvitationView,
  WorkspaceMembershipView,
  WorkspaceStatus,
  WorkspaceSummary,
  WorkspaceTransitionRequest,
} from '@witness/contracts';
import { AFFILIATION_TYPES } from '@witness/contracts';

import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useSession } from '@/lib/session';
import { ProgramNav } from '@/components/program-nav';
import {
  AffiliationTag,
  Button,
  Card,
  ErrorNotice,
  MembershipStateBadge,
  RoleAssignmentControl,
  WorkspaceInvitationStatusBadge,
  WorkspaceStatusBadge,
} from '@/components/ui';

/**
 * Mirrors `packages/domain/src/workspace.ts`'s `TRANSITIONS` table — for
 * deciding which buttons to show only. The server re-validates every
 * transition independently; a stale or hand-crafted client request gains
 * nothing from this table being wrong.
 */
const WORKSPACE_TRANSITION_ACTIONS: Record<
  WorkspaceStatus,
  { action: Exclude<WorkspaceTransitionRequest['action'], 'reopen'>; label: string }[]
> = {
  draft: [
    { action: 'recruit', label: 'Open for recruiting' },
    { action: 'activate', label: 'Activate' },
  ],
  recruiting: [{ action: 'activate', label: 'Activate' }],
  active: [
    { action: 'review', label: 'Move to review' },
    { action: 'close', label: 'Close' },
  ],
  review: [
    { action: 'activate', label: 'Send back to active' },
    { action: 'close', label: 'Close' },
  ],
  closed: [],
  archived: [],
};

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
  const { currentUser } = useAuth();

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

  const [invitations, setInvitations] = useState<WorkspaceInvitationView[]>([]);
  const [invitationsUnavailable, setInvitationsUnavailable] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteRole, setInviteRole] = useState('');
  const [inviteAffiliationType, setInviteAffiliationType] =
    useState<AffiliationType>('independent');
  const [inviteAffiliationLabel, setInviteAffiliationLabel] = useState('');
  const [inviteMessage, setInviteMessage] = useState('');
  const [inviteStatusMessage, setInviteStatusMessage] = useState<string | null>(null);
  const [inviteBusy, setInviteBusy] = useState(false);
  const [invitationActionId, setInvitationActionId] = useState<string | null>(null);

  const [transitionBusy, setTransitionBusy] = useState(false);
  const [reopenReason, setReopenReason] = useState('');
  const [showReopenForm, setShowReopenForm] = useState(false);

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

        try {
          const invitationsResult = await api.listWorkspaceInvitations(id, user);
          if (cancelledRef.current) return;
          setInvitations(invitationsResult);
          setInvitationsUnavailable(false);
        } catch (invitationsCaught) {
          if (cancelledRef.current) return;
          setInvitations([]);
          // Same permission boundary as membership — `role_assignment:read`
          // is admin-only, so a 403 here means "not your role", not "there
          // are no invitations".
          if (invitationsCaught instanceof ApiError && invitationsCaught.status === 403) {
            setInvitationsUnavailable(true);
          } else {
            setInvitationsUnavailable(false);
            setError(
              invitationsCaught instanceof ApiError
                ? invitationsCaught.message
                : "Couldn't load this program's external collaborators.",
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

  const inviteExternalCollaborator = async (event: FormEvent) => {
    event.preventDefault();
    if (inviteRole === '') return;
    setInviteBusy(true);
    setError(null);
    setInviteStatusMessage(null);
    try {
      const body: CreateWorkspaceInvitationRequest = {
        invitedEmail: inviteEmail,
        invitedName: inviteName.trim() === '' ? undefined : inviteName.trim(),
        role: inviteRole as WitnessRole,
        affiliationType: inviteAffiliationType,
        affiliationLabel:
          inviteAffiliationLabel.trim() === '' ? undefined : inviteAffiliationLabel.trim(),
        message: inviteMessage.trim() === '' ? undefined : inviteMessage.trim(),
      };
      const invited = await api.createWorkspaceInvitation(id, body, user);
      setInviteEmail('');
      setInviteName('');
      setInviteRole('');
      setInviteAffiliationType('independent');
      setInviteAffiliationLabel('');
      setInviteMessage('');
      setInviteStatusMessage(
        `Invitation sent to ${invited.invitedEmail} as ${invited.role}. Delivery: ${invited.deliveryStatus}.`,
      );
      await load({ current: false });
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Something went wrong.');
    } finally {
      setInviteBusy(false);
    }
  };

  const resendInvitation = async (invitationId: string) => {
    setInvitationActionId(invitationId);
    setError(null);
    try {
      const result = await api.resendWorkspaceInvitation(id, invitationId, user);
      setInviteStatusMessage(
        `Invitation notification for ${result.invitedEmail}: ${result.deliveryStatus}.`,
      );
      await load({ current: false });
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Something went wrong.');
    } finally {
      setInvitationActionId(null);
    }
  };

  const revokeInvitation = async (invitationId: string) => {
    setInvitationActionId(invitationId);
    setError(null);
    try {
      await api.revokeWorkspaceInvitation(id, invitationId, user);
      await load({ current: false });
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Something went wrong.');
    } finally {
      setInvitationActionId(null);
    }
  };

  const applyTransition = async (
    action: Exclude<WorkspaceTransitionRequest['action'], 'reopen'>,
  ) => {
    if (workspace === null) return;
    setTransitionBusy(true);
    setError(null);
    try {
      const updated = await api.transitionWorkspace(
        id,
        { action, expectedVersion: workspace.version },
        user,
      );
      setWorkspace(updated);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Something went wrong.');
    } finally {
      setTransitionBusy(false);
    }
  };

  const reopenProgramme = async (event: FormEvent) => {
    event.preventDefault();
    if (workspace === null || reopenReason.trim() === '') return;
    setTransitionBusy(true);
    setError(null);
    try {
      const updated = await api.transitionWorkspace(
        id,
        { action: 'reopen', reason: reopenReason.trim(), expectedVersion: workspace.version },
        user,
      );
      setWorkspace(updated);
      setReopenReason('');
      setShowReopenForm(false);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Something went wrong.');
    } finally {
      setTransitionBusy(false);
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
  const role = currentUser?.workspaces.find((item) => item.id === id)?.role ?? null;

  return (
    <div className="space-y-6">
      <Link href={`/workspaces/${id}`} className="inline-block text-sm underline">
        ← Back to program
      </Link>

      {error !== null && <ErrorNotice message={error} />}

      <div className="max-w-2xl">
        <p className="text-sm font-medium text-[var(--color-accent)]">{workspace.name}</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Manage</h1>
        <p className="mt-2 text-[var(--color-ink-muted)]">
          Prepare this program to run, review its setup and manage access where your role permits.
        </p>
        {organisation !== null && (
          <p className="mt-2 text-sm text-[var(--color-ink-muted)]">
            Organisation:{' '}
            <Link href={`/organisations/${organisation.id}`} className="underline">
              {organisation.name}
            </Link>
          </p>
        )}
      </div>

      <ProgramNav workspaceId={id} role={role} />

      <section aria-labelledby="status-heading" className="space-y-3">
        <h2 id="status-heading" className="text-lg font-semibold">
          Programme status
        </h2>
        <Card className="space-y-3">
          <p className="flex items-center gap-2 text-sm">
            Currently <WorkspaceStatusBadge status={workspace.status} />
          </p>
          {workspace.status === 'closed' ? (
            showReopenForm ? (
              <form onSubmit={(event) => void reopenProgramme(event)} className="space-y-2">
                <label htmlFor="reopenReason" className="block text-sm font-medium">
                  Reason for reopening <span aria-hidden="true">*</span>
                  <span className="sr-only">(required)</span>
                </label>
                <textarea
                  id="reopenReason"
                  required
                  rows={2}
                  maxLength={2000}
                  value={reopenReason}
                  onChange={(event) => setReopenReason(event.target.value)}
                  placeholder="Why is this closed programme reopening?"
                  className="w-full rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2 text-sm"
                />
                <div className="flex gap-2">
                  <Button
                    type="submit"
                    variant="primary"
                    disabled={transitionBusy || reopenReason.trim() === ''}
                  >
                    {transitionBusy ? 'Reopening…' : 'Reopen programme'}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={transitionBusy}
                    onClick={() => setShowReopenForm(false)}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            ) : (
              <Button variant="secondary" onClick={() => setShowReopenForm(true)}>
                Reopen programme
              </Button>
            )
          ) : (
            <div className="flex flex-wrap gap-2">
              {WORKSPACE_TRANSITION_ACTIONS[workspace.status].map(({ action, label }) => (
                <Button
                  key={action}
                  variant="secondary"
                  disabled={transitionBusy}
                  onClick={() => void applyTransition(action)}
                >
                  {transitionBusy ? 'Working…' : label}
                </Button>
              ))}
              {workspace.status === 'archived' && (
                <p className="text-sm text-[var(--color-ink-muted)]">
                  Archived programmes are read-only and cannot transition further.
                </p>
              )}
            </div>
          )}
        </Card>
      </section>

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

      <section aria-labelledby="invite-external-heading">
        <h2 id="invite-external-heading" className="mb-3 text-lg font-semibold">
          Invite an external collaborator
        </h2>
        <Card className="space-y-4">
          <p className="text-xs text-[var(--color-ink-muted)]">
            For a facilitator, reviewer, or Knowledge Steward from outside{' '}
            {organisation?.name ?? 'your organisation'} — an invitation scoped to this one
            programme. It never adds them to {organisation?.name ?? 'your organisation'}.
          </p>
          {inviteStatusMessage !== null && (
            <p className="text-sm text-[var(--color-ink)]" role="status">
              {inviteStatusMessage}
            </p>
          )}
          <form onSubmit={(event) => void inviteExternalCollaborator(event)} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="inviteExternalEmail" className="mb-1 block text-sm font-medium">
                  Email <span aria-hidden="true">*</span>
                  <span className="sr-only">(required)</span>
                </label>
                <input
                  id="inviteExternalEmail"
                  type="email"
                  required
                  maxLength={320}
                  value={inviteEmail}
                  onChange={(event) => setInviteEmail(event.target.value)}
                  placeholder="mele@example.org"
                  className="w-full rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2"
                />
              </div>
              <div>
                <label htmlFor="inviteExternalName" className="mb-1 block text-sm font-medium">
                  Name
                </label>
                <input
                  id="inviteExternalName"
                  maxLength={200}
                  value={inviteName}
                  onChange={(event) => setInviteName(event.target.value)}
                  placeholder="Mele Tupou"
                  className="w-full rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2"
                />
              </div>
              <div>
                <label htmlFor="inviteExternalRole" className="mb-1 block text-sm font-medium">
                  Role <span aria-hidden="true">*</span>
                  <span className="sr-only">(required)</span>
                </label>
                <select
                  id="inviteExternalRole"
                  required
                  value={inviteRole}
                  onChange={(event) => setInviteRole(event.target.value)}
                  className="w-full rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2"
                >
                  <option value="">Choose a role…</option>
                  {roles.map((definition) => (
                    <option
                      key={definition.role}
                      value={definition.role}
                      title={definition.description}
                    >
                      {definition.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label
                  htmlFor="inviteExternalAffiliationType"
                  className="mb-1 block text-sm font-medium"
                >
                  Participating as
                </label>
                <select
                  id="inviteExternalAffiliationType"
                  value={inviteAffiliationType}
                  onChange={(event) =>
                    setInviteAffiliationType(event.target.value as AffiliationType)
                  }
                  className="w-full rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2"
                >
                  {AFFILIATION_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </div>
              {(inviteAffiliationType === 'organisation' ||
                inviteAffiliationType === 'community') && (
                <div className="sm:col-span-2">
                  <label
                    htmlFor="inviteExternalAffiliationLabel"
                    className="mb-1 block text-sm font-medium"
                  >
                    {inviteAffiliationType === 'organisation'
                      ? 'Organisation name'
                      : 'Community name'}
                  </label>
                  <input
                    id="inviteExternalAffiliationLabel"
                    maxLength={300}
                    value={inviteAffiliationLabel}
                    onChange={(event) => setInviteAffiliationLabel(event.target.value)}
                    placeholder={
                      inviteAffiliationType === 'organisation'
                        ? 'Pacific Water Trust'
                        : 'Nukuʻalofa Youth Council'
                    }
                    className="w-full rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2"
                  />
                </div>
              )}
              <div className="sm:col-span-2">
                <label htmlFor="inviteExternalMessage" className="mb-1 block text-sm font-medium">
                  Personal message
                </label>
                <textarea
                  id="inviteExternalMessage"
                  rows={2}
                  maxLength={2000}
                  value={inviteMessage}
                  onChange={(event) => setInviteMessage(event.target.value)}
                  placeholder="Optional — shown to the invitee before they accept."
                  className="w-full rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2"
                />
              </div>
            </div>
            <Button type="submit" variant="primary" disabled={inviteBusy || inviteRole === ''}>
              {inviteBusy ? 'Inviting…' : 'Send invitation'}
            </Button>
          </form>
        </Card>
      </section>

      <section aria-labelledby="external-collaborators-heading">
        <h2 id="external-collaborators-heading" className="mb-3 text-lg font-semibold">
          External collaborators
        </h2>
        {invitationsUnavailable ? (
          <Card>
            <p className="text-sm text-[var(--color-ink-muted)]">
              External collaborator invitations aren&apos;t available to your role.
            </p>
          </Card>
        ) : invitations.length === 0 ? (
          <Card>
            <p className="text-sm text-[var(--color-ink-muted)]">
              No external collaborators invited yet.
            </p>
          </Card>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <caption className="sr-only">
                External collaborator invitations and their status
              </caption>
              <thead>
                <tr className="border-b border-[var(--color-line)]">
                  <th scope="col" className="py-2 pr-4 font-medium">
                    Person
                  </th>
                  <th scope="col" className="py-2 pr-4 font-medium">
                    Role
                  </th>
                  <th scope="col" className="py-2 pr-4 font-medium">
                    Affiliation
                  </th>
                  <th scope="col" className="py-2 pr-4 font-medium">
                    Status
                  </th>
                  <th scope="col" className="py-2 font-medium">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {invitations.map((invitation) => (
                  <tr key={invitation.id} className="border-b border-[var(--color-line)]">
                    <td className="py-3 pr-4">
                      <div className="font-medium">
                        {invitation.invitedName ?? invitation.invitedEmail}
                      </div>
                      <div className="text-xs text-[var(--color-ink-muted)]">
                        {invitation.invitedEmail}
                      </div>
                    </td>
                    <td className="py-3 pr-4">{invitation.role}</td>
                    <td className="py-3 pr-4">
                      <AffiliationTag
                        type={invitation.affiliationType}
                        label={invitation.affiliationLabel}
                      />
                    </td>
                    <td className="py-3 pr-4">
                      <WorkspaceInvitationStatusBadge status={invitation.status} />
                    </td>
                    <td className="py-3">
                      {invitation.status === 'pending' && (
                        <div className="flex flex-wrap gap-2">
                          <Button
                            variant="secondary"
                            disabled={invitationActionId === invitation.id}
                            onClick={() => void resendInvitation(invitation.id)}
                          >
                            {invitationActionId === invitation.id ? 'Working…' : 'Resend'}
                          </Button>
                          <Button
                            variant="danger"
                            disabled={invitationActionId === invitation.id}
                            onClick={() => void revokeInvitation(invitation.id)}
                          >
                            Revoke
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
