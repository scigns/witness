'use client';

/**
 * Organisation detail — membership management.
 *
 * `permittedActions` comes from the server, same reasoning as the record
 * detail page: the client renders what the domain says is possible rather
 * than reimplementing the membership state machine.
 */

import Link from 'next/link';
import { use, useCallback, useEffect, useState } from 'react';

import type {
  MembershipAction,
  OrganisationMembershipView,
  OrganisationSummary,
  UserSummary,
} from '@witness/contracts';

import { api, ApiError } from '@/lib/api';
import { useSession } from '@/lib/session';
import { Button, Card, ErrorNotice, MembershipStateBadge } from '@/components/ui';

const ACTION_LABELS: Record<MembershipAction['action'], string> = {
  activate: 'Activate',
  suspend: 'Suspend access',
  revoke: 'Revoke membership',
};

export default function OrganisationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user, ready } = useSession();

  const [organisation, setOrganisation] = useState<OrganisationSummary | null>(null);
  const [memberships, setMemberships] = useState<OrganisationMembershipView[]>([]);
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    async (cancelledRef: { current: boolean }) => {
      try {
        const [organisationsResult, membershipsResult, usersResult] = await Promise.all([
          api.listOrganisations(user),
          api.listOrganisationMemberships(id, user),
          api.listUsers(user),
        ]);
        if (cancelledRef.current) return;

        setOrganisation(organisationsResult.organisations.find((o) => o.id === id) ?? null);
        setMemberships(membershipsResult.memberships);
        setUsers(usersResult.users);
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

  if (loading) {
    return <p className="text-[var(--color-ink-muted)]">Loading…</p>;
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

      <h1 className="text-2xl font-semibold tracking-tight">{organisation.name}</h1>

      <section aria-labelledby="add-member-heading">
        <h2 id="add-member-heading" className="mb-3 text-lg font-semibold">
          Add a user to this organisation
        </h2>
        <Card className="space-y-3">
          {eligibleUsers.length === 0 ? (
            <p className="text-sm text-[var(--color-ink-muted)]">
              Every registered user is already a member, or none exist yet.{' '}
              <Link href="/users/new" className="underline">
                Add a user
              </Link>{' '}
              first.
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
