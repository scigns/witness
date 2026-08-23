'use client';

/**
 * Organisation detail — membership management.
 *
 * `permittedActions` comes from the server, same reasoning as the record
 * detail page: the client renders what the domain says is possible rather
 * than reimplementing the membership state machine.
 */

import Link from 'next/link';
import { use, useCallback, useEffect, useState, type FormEvent } from 'react';

import type {
  MembershipAction,
  OrganisationMembershipView,
  OrganisationStorageUsage,
  OrganisationSummary,
  OrganisationUsage,
  RoleAssignmentView,
  RoleDefinition,
  UserSummary,
  WitnessRole,
} from '@witness/contracts';

import { api, ApiError } from '@/lib/api';
import { useSession } from '@/lib/session';
import {
  Button,
  Card,
  ErrorNotice,
  LinkButton,
  MembershipStateBadge,
  RoleAssignmentControl,
} from '@/components/ui';

const ACTION_LABELS: Record<MembershipAction['action'], string> = {
  activate: 'Activate',
  suspend: 'Suspend access',
  revoke: 'Revoke membership',
};

/** `null` (no completed cycle yet) reads as "—", never a misleading "0h". */
function formatHours(hours: number | null): string {
  if (hours === null) return '—';
  if (hours < 48) return `${Math.round(hours)}h`;
  return `${(hours / 24).toFixed(1)}d`;
}

export default function OrganisationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user, ready } = useSession();

  const [organisation, setOrganisation] = useState<OrganisationSummary | null>(null);
  const [storage, setStorage] = useState<OrganisationStorageUsage | null>(null);
  const [storageUnavailable, setStorageUnavailable] = useState(false);
  const [usage, setUsage] = useState<OrganisationUsage | null>(null);
  const [usageUnavailable, setUsageUnavailable] = useState(false);
  const [quotaInput, setQuotaInput] = useState('');
  const [memberships, setMemberships] = useState<OrganisationMembershipView[]>([]);
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [usersUnavailable, setUsersUnavailable] = useState(false);
  const [roles, setRoles] = useState<RoleDefinition[]>([]);
  const [roleAssignments, setRoleAssignments] = useState<Record<string, RoleAssignmentView>>({});
  const [selectedUserId, setSelectedUserId] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteDisplayName, setInviteDisplayName] = useState('');
  const [inviteRole, setInviteRole] = useState('');
  const [inviteMessage, setInviteMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    async (cancelledRef: { current: boolean }) => {
      try {
        // `listUsers` reads the platform-wide user directory, which today's
        // domain model has no role for anyone to hold (see
        // `RoleResolutionService.globalGrantTiers` and `prisma/invite.ts`) —
        // an organisation admin gets `FORBIDDEN` here even though everything
        // else on this page is properly in their scope. Best-effort, not
        // `Promise.all`'d with the rest: a directory nobody can reach yet
        // must not take the whole page down with it.
        const [organisationsResult, membershipsResult, rolesResult] = await Promise.all([
          api.listOrganisations(user),
          api.listOrganisationMemberships(id, user),
          api.listRoles(user),
        ]);
        if (cancelledRef.current) return;

        setOrganisation(organisationsResult.organisations.find((o) => o.id === id) ?? null);
        setMemberships(membershipsResult.memberships);
        setRoles(rolesResult.roles);

        try {
          const storageResult = await api.getOrganisationStorage(id, user);
          if (cancelledRef.current) return;
          setStorage(storageResult);
          setStorageUnavailable(false);
        } catch {
          if (cancelledRef.current) return;
          setStorage(null);
          setStorageUnavailable(true);
        }

        try {
          const usageResult = await api.getOrganisationUsage(id, user);
          if (cancelledRef.current) return;
          setUsage(usageResult);
          setUsageUnavailable(false);
        } catch {
          if (cancelledRef.current) return;
          setUsage(null);
          setUsageUnavailable(true);
        }

        try {
          const usersResult = await api.listUsers(user);
          if (cancelledRef.current) return;
          setUsers(usersResult.users);
          setUsersUnavailable(false);
        } catch {
          if (cancelledRef.current) return;
          setUsers([]);
          setUsersUnavailable(true);
        }

        const assignments = await Promise.all(
          membershipsResult.memberships.map((membership) =>
            api.getOrganisationRoleAssignment(id, membership.id, user),
          ),
        );
        if (cancelledRef.current) return;
        setRoleAssignments(Object.fromEntries(assignments.map((a) => [a.membershipId, a])));

        setError(null);
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

  const memberUserIds = new Set(memberships.map((m) => m.userId));
  const eligibleUsers = users.filter((candidate) => !memberUserIds.has(candidate.id));

  const addMember = async () => {
    if (selectedUserId === '') return;
    setBusy(true);
    try {
      await api.addOrganisationMembership(id, { userId: selectedUserId }, user);
      setSelectedUserId('');
      await load({ current: false });
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  const inviteUser = async (event: FormEvent) => {
    event.preventDefault();
    if (inviteRole === '') return;
    setBusy(true);
    setError(null);
    setInviteMessage(null);
    try {
      const invited = await api.inviteOrganisationUser(
        id,
        { email: inviteEmail, displayName: inviteDisplayName, role: inviteRole as WitnessRole },
        user,
      );
      setInviteEmail('');
      setInviteDisplayName('');
      setInviteRole('');
      setInviteMessage(
        `${invited.displayName} was added to this organisation as ${invited.role}. They can sign ` +
          `in once they authenticate with ${invited.email}.`,
      );
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
      await api.transitionOrganisationMembership(id, membershipId, { action }, user);
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
      await api.assignOrganisationRole(id, membershipId, { role: role as WitnessRole }, user);
      await load({ current: false });
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  const updateQuota = async (event: FormEvent) => {
    event.preventDefault();
    const gib = Number(quotaInput);
    if (!Number.isFinite(gib) || gib <= 0) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api.updateStorageQuota(
        id,
        { quotaBytes: Math.round(gib * 1024 * 1024 * 1024) },
        user,
      );
      setStorage(result);
      setQuotaInput('');
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  const removeRole = async (membershipId: string) => {
    setBusy(true);
    try {
      await api.removeOrganisationRole(id, membershipId, user);
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

  if (organisation === null) {
    return (
      <div className="space-y-4">
        <ErrorNotice message={error ?? `No organisation with id '${id}'.`} />
        <Link href="/organisations" className="text-sm underline">
          ← Back to organisations
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link href="/organisations" className="inline-block text-sm underline">
        ← Back to organisations
      </Link>

      {error !== null && <ErrorNotice message={error} />}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{organisation.name}</h1>
        <LinkButton href={`/organisations/${id}/consent-templates`}>Consent templates →</LinkButton>
      </div>

      <section aria-labelledby="storage-heading">
        <h2 id="storage-heading" className="mb-3 text-lg font-semibold">
          Storage
        </h2>
        <Card className="space-y-3">
          {storageUnavailable ? (
            <p className="text-sm text-[var(--color-ink-muted)]">
              Storage usage isn&apos;t available to your role.
            </p>
          ) : storage === null ? (
            <p className="text-sm text-[var(--color-ink-muted)]">Loading…</p>
          ) : (
            <>
              {(() => {
                const usedGiB = Number(storage.usedBytes) / (1024 * 1024 * 1024);
                const quotaGiB = Number(storage.quotaBytes) / (1024 * 1024 * 1024);
                const fraction = quotaGiB > 0 ? Math.min(1, usedGiB / quotaGiB) : 0;
                return (
                  <div role="status">
                    <p className="text-sm">
                      {usedGiB.toFixed(2)} GB of {quotaGiB.toFixed(0)} GB included used
                    </p>
                    <div
                      className="mt-2 h-2 w-full overflow-hidden rounded bg-[var(--color-line)]"
                      role="progressbar"
                      aria-valuenow={Math.round(fraction * 100)}
                      aria-valuemin={0}
                      aria-valuemax={100}
                    >
                      <div
                        className="h-full bg-[var(--color-accent)]"
                        style={{ width: `${fraction * 100}%` }}
                      />
                    </div>
                  </div>
                );
              })()}
              <form
                onSubmit={(event) => void updateQuota(event)}
                className="flex flex-wrap items-end gap-2 pt-2"
              >
                <div>
                  <label htmlFor="quotaInput" className="mb-1 block text-sm font-medium">
                    Set quota (GB) — operator override
                  </label>
                  <input
                    id="quotaInput"
                    type="number"
                    min="1"
                    step="1"
                    value={quotaInput}
                    onChange={(event) => setQuotaInput(event.target.value)}
                    placeholder="5"
                    className="w-32 rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2"
                  />
                </div>
                <Button type="submit" variant="secondary" disabled={busy || quotaInput === ''}>
                  {busy ? 'Updating…' : 'Update quota'}
                </Button>
              </form>
              <p className="text-xs text-[var(--color-ink-muted)]">
                Reaching quota blocks new uploads only — existing content is never removed. Export
                or remove content to free up space, or increase the quota here.
              </p>
            </>
          )}
        </Card>
      </section>

      <section aria-labelledby="usage-heading">
        <h2 id="usage-heading" className="mb-3 text-lg font-semibold">
          Usage
        </h2>
        <Card>
          {usageUnavailable ? (
            <p className="text-sm text-[var(--color-ink-muted)]">
              Usage isn&apos;t available to your role.
            </p>
          ) : usage === null ? (
            <p className="text-sm text-[var(--color-ink-muted)]">Loading…</p>
          ) : (
            <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
              {[
                ['Members', usage.userCount],
                ['Participants', usage.participantCount],
                ['Programs', usage.programCount],
                ['Sessions', usage.sessionCount],
                [
                  'Transcription jobs',
                  usage.transcriptionFailedCount > 0
                    ? `${usage.transcriptionJobCount} (${usage.transcriptionFailedCount} failed)`
                    : usage.transcriptionJobCount,
                ],
                [
                  'AI summary jobs',
                  usage.summaryFailedCount > 0
                    ? `${usage.aiProcessingJobCount} (${usage.summaryFailedCount} failed)`
                    : usage.aiProcessingJobCount,
                ],
                ['Reviews completed', usage.reviewsCompletedCount],
                ['Reports published', usage.reportsPublishedCount],
                ['Exports', usage.exportCount],
                [
                  'Session close → report published',
                  formatHours(usage.medianSessionCloseToPublishHours),
                ],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-[var(--color-ink-muted)]">{label}</dt>
                  <dd className="text-base font-medium">{value}</dd>
                </div>
              ))}
            </dl>
          )}
        </Card>
      </section>

      <section aria-labelledby="invite-user-heading">
        <h2 id="invite-user-heading" className="mb-3 text-lg font-semibold">
          Invite a new person
        </h2>
        <Card className="space-y-4">
          {inviteMessage !== null && (
            <p className="text-sm text-[var(--color-ink)]" role="status">
              {inviteMessage}
            </p>
          )}
          <form onSubmit={(event) => void inviteUser(event)} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label htmlFor="inviteDisplayName" className="mb-1 block text-sm font-medium">
                  Name <span aria-hidden="true">*</span>
                  <span className="sr-only">(required)</span>
                </label>
                <input
                  id="inviteDisplayName"
                  required
                  maxLength={200}
                  value={inviteDisplayName}
                  onChange={(event) => setInviteDisplayName(event.target.value)}
                  placeholder="Mele Tupou"
                  className="w-full rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2"
                />
              </div>
              <div>
                <label htmlFor="inviteEmail" className="mb-1 block text-sm font-medium">
                  Email <span aria-hidden="true">*</span>
                  <span className="sr-only">(required)</span>
                </label>
                <input
                  id="inviteEmail"
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
                <label htmlFor="inviteRole" className="mb-1 block text-sm font-medium">
                  Role <span aria-hidden="true">*</span>
                  <span className="sr-only">(required)</span>
                </label>
                <select
                  id="inviteRole"
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
            </div>
            <p className="text-xs text-[var(--color-ink-muted)]">
              Registers a Witness account, adds it to this organisation and assigns the chosen role,
              all at once. There is no invitation email yet — the person activates their account by
              signing in through the identity provider with this exact email address.
            </p>
            <Button type="submit" variant="primary" disabled={busy || inviteRole === ''}>
              {busy ? 'Inviting…' : 'Invite to this organisation'}
            </Button>
          </form>
        </Card>
      </section>

      <section aria-labelledby="add-member-heading">
        <h2 id="add-member-heading" className="mb-3 text-lg font-semibold">
          Add an existing Witness user
        </h2>
        <Card className="space-y-3">
          {usersUnavailable ? (
            <p className="text-sm text-[var(--color-ink-muted)]">
              You can&apos;t browse the full user directory from here — that needs a
              platform-administrator role nobody holds yet, by design (see{' '}
              <code>prisma/invite.ts</code>). This only affects moving someone who already has a
              Witness account into this organisation; use the invite form above for anyone new.
            </p>
          ) : eligibleUsers.length === 0 ? (
            <p className="text-sm text-[var(--color-ink-muted)]">
              Every registered user is already a member, or none exist yet. Use the invite form
              above to register someone new.
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
                {eligibleUsers.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.displayName} ({candidate.email})
                  </option>
                ))}
              </select>
              <Button
                variant="primary"
                disabled={busy || selectedUserId === ''}
                onClick={() => void addMember()}
              >
                Add to organisation
              </Button>
            </div>
          )}
        </Card>
      </section>

      <section aria-labelledby="members-heading">
        <h2 id="members-heading" className="mb-3 text-lg font-semibold">
          Members
        </h2>
        {memberships.length === 0 ? (
          <Card>
            <p className="text-sm text-[var(--color-ink-muted)]">No members yet.</p>
          </Card>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <caption className="sr-only">Organisation members and their status</caption>
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
