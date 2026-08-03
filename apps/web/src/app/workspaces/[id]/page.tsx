'use client';

/**
 * Workspace detail — membership management.
 *
 * The "add to workspace" list is restricted to organisation members whose
 * organisation membership is in good standing (`invited` or `active`) — the
 * same eligibility rule the API enforces server-side
 * (`packages/domain/src/workspace-membership.ts`). Filtering the dropdown to
 * only eligible users is a convenience; it is not what makes the rule real —
 * the API would refuse an ineligible user even if this filter had a bug.
 */

import Link from 'next/link';
import { use, useCallback, useEffect, useState } from 'react';

import type {
  MembershipAction,
  MembershipState,
  OrganisationMembershipView,
  OrganisationSummary,
  WorkspaceMembershipView,
  WorkspaceSummary,
} from '@witness/contracts';

import { api, ApiError } from '@/lib/api';
import { useSession } from '@/lib/session';
import { Button, Card, ErrorNotice, MembershipStateBadge } from '@/components/ui';

const ACTION_LABELS: Record<MembershipAction['action'], string> = {
  activate: 'Activate',
  suspend: 'Suspend access',
  revoke: 'Revoke membership',
};

const GOOD_STANDING: ReadonlySet<MembershipState> = new Set<MembershipState>(['invited', 'active']);

export default function WorkspacePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user, ready } = useSession();

  const [workspace, setWorkspace] = useState<WorkspaceSummary | null>(null);
  const [organisation, setOrganisation] = useState<OrganisationSummary | null>(null);
  const [memberships, setMemberships] = useState<WorkspaceMembershipView[]>([]);
  const [organisationMembers, setOrganisationMembers] = useState<OrganisationMembershipView[]>([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    async (cancelledRef: { current: boolean }) => {
      try {
        const [workspacesResult, organisationsResult, membershipsResult] = await Promise.all([
          api.listWorkspaces(user),
          api.listOrganisations(user),
          api.listWorkspaceMemberships(id, user),
        ]);
        if (cancelledRef.current) return;

        const foundWorkspace = workspacesResult.workspaces.find((w) => w.id === id) ?? null;
        setWorkspace(foundWorkspace);
        setOrganisation(
          foundWorkspace === null
            ? null
            : (organisationsResult.organisations.find(
                (o) => o.id === foundWorkspace.organisationId,
              ) ?? null),
        );
        setMemberships(membershipsResult.memberships);

        if (foundWorkspace !== null) {
          const orgMembersResult = await api.listOrganisationMemberships(
            foundWorkspace.organisationId,
            user,
          );
          if (cancelledRef.current) return;
          setOrganisationMembers(orgMembersResult.memberships);
        }

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

  if (loading) {
    return <p className="text-[var(--color-ink-muted)]">Loading…</p>;
  }

  if (workspace === null) {
    return (
      <div className="space-y-4">
        <ErrorNotice message={error ?? `No workspace with id '${id}'.`} />
        <Link href="/workspaces" className="text-sm underline">
          ← Back to workspaces
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link href="/workspaces" className="inline-block text-sm underline">
        ← Back to workspaces
      </Link>

      {error !== null && <ErrorNotice message={error} />}

      <div>
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

      <section aria-labelledby="add-member-heading">
        <h2 id="add-member-heading" className="mb-3 text-lg font-semibold">
          Add an organisation member to this workspace
        </h2>
        <Card className="space-y-3">
          {eligibleOrganisationMembers.length === 0 ? (
            <p className="text-sm text-[var(--color-ink-muted)]">
              No eligible organisation members. A user must be an invited or active member of{' '}
              {organisation?.name ?? 'this workspace’s organisation'} before they can be added to a
              workspace inside it.
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
                Add to workspace
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
              <caption className="sr-only">Workspace members and their status</caption>
              <thead>
                <tr className="border-b border-[var(--color-line)]">
                  <th scope="col" className="py-2 pr-4 font-medium">
                    User
                  </th>
                  <th scope="col" className="py-2 pr-4 font-medium">
                    Membership status
                  </th>
                  <th scope="col" className="py-2 font-medium">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {memberships.map((membership) => (
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
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
