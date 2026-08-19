'use client';

/**
 * People directory — a browsable, human view of who is in this program
 * (Client-Ready Experience overhaul, Phase 6). Deliberately cards, not the
 * admin membership table (that lives at `/manage` for facilitators/admins
 * who need to change roles or revoke access).
 */

import Link from 'next/link';
import { use, useCallback, useEffect, useState } from 'react';

import type {
  RoleAssignmentView,
  WorkspaceMembershipView,
  WorkspaceSummary,
} from '@witness/contracts';

import { api, ApiError } from '@/lib/api';
import { useSession } from '@/lib/session';
import { Card, EmptyState, ErrorNotice, PersonCard, RoleBadge } from '@/components/ui';

export default function PeoplePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user, ready } = useSession();

  const [workspace, setWorkspace] = useState<WorkspaceSummary | null>(null);
  const [members, setMembers] = useState<WorkspaceMembershipView[]>([]);
  const [roleAssignments, setRoleAssignments] = useState<Record<string, RoleAssignmentView>>({});
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(
    async (cancelledRef: { current: boolean }) => {
      try {
        const [workspaceResult, membershipsResult] = await Promise.all([
          api.getWorkspace(id, user),
          api.listWorkspaceMemberships(id, user),
        ]);
        if (cancelledRef.current) return;

        setWorkspace(workspaceResult);
        setMembers(membershipsResult.memberships);

        const assignments = await Promise.all(
          membershipsResult.memberships.map((membership) =>
            api.getWorkspaceRoleAssignment(id, membership.id, user).catch(() => null),
          ),
        );
        if (cancelledRef.current) return;
        setRoleAssignments(
          Object.fromEntries(
            assignments
              .filter((a): a is RoleAssignmentView => a !== null)
              .map((a) => [a.membershipId, a]),
          ),
        );
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

  const visible = members.filter((member) => {
    if (member.state !== 'active') return false;
    if (query.trim() === '') return true;
    const needle = query.trim().toLowerCase();
    return (
      member.userDisplayName.toLowerCase().includes(needle) ||
      (member.userBio ?? '').toLowerCase().includes(needle)
    );
  });

  const facilitators = visible.filter((m) => roleAssignments[m.id]?.role === 'facilitator');
  const others = visible.filter((m) => roleAssignments[m.id]?.role !== 'facilitator');

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

  return (
    <div className="space-y-6">
      <Link href={`/workspaces/${id}`} className="inline-block text-sm underline">
        ← Back to {workspace.name}
      </Link>

      {error !== null && <ErrorNotice message={error} />}

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">People</h1>
        <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
          Everyone taking part in {workspace.name}.
        </p>
      </div>

      {members.length > 0 && (
        <div>
          <label htmlFor="people-search" className="sr-only">
            Search people
          </label>
          <input
            id="people-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by name or background…"
            className="w-full max-w-sm rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2 text-sm"
          />
        </div>
      )}

      {members.length === 0 ? (
        <EmptyState
          title="No one has joined yet"
          body="Invite the people who will take part in this co-design from the manage-program screen."
        />
      ) : visible.length === 0 ? (
        <Card>
          <p className="text-sm text-[var(--color-ink-muted)]">
            No one matches &ldquo;{query}&rdquo;.
          </p>
        </Card>
      ) : (
        <div className="space-y-6">
          {facilitators.length > 0 && (
            <section aria-labelledby="facilitators-heading" className="space-y-3">
              <h2
                id="facilitators-heading"
                className="text-sm font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]"
              >
                Facilitators
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {facilitators.map((member) => (
                  <PersonCard
                    key={member.id}
                    name={member.userDisplayName}
                    bio={member.userBio}
                    badge={<RoleBadge role={roleAssignments[member.id]?.role ?? null} />}
                  />
                ))}
              </div>
            </section>
          )}

          <section aria-labelledby="participants-heading" className="space-y-3">
            {facilitators.length > 0 && (
              <h2
                id="participants-heading"
                className="text-sm font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]"
              >
                Participants
              </h2>
            )}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {others.map((member) => (
                <PersonCard
                  key={member.id}
                  name={member.userDisplayName}
                  bio={member.userBio}
                  badge={<RoleBadge role={roleAssignments[member.id]?.role ?? null} />}
                />
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
