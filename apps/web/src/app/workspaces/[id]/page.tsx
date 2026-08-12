'use client';

/**
 * Program Home — the participant-first landing experience (Client-Ready
 * Experience overhaul, Phase 3).
 *
 * "Workspace" stays the backend/domain name (BUILD_ROADMAP.md Release 0.2) —
 * this page presents it as a co-design Program without duplicating the
 * concept, per the overhaul's explicit instruction to adapt the existing
 * structure rather than invent a parallel one. A first-time participant
 * should read this page and understand where they are, why, who else is
 * here, and what to do next — not land on a membership-administration table
 * (that experience still exists, moved to `/manage`, for facilitators and
 * admins who need it).
 */

import Link from 'next/link';
import { use, useCallback, useEffect, useState } from 'react';

import type {
  CoDesignSessionSummary,
  OrganisationSummary,
  WorkspaceMembershipView,
  WorkspaceSummary,
} from '@witness/contracts';

import { api, ApiError } from '@/lib/api';
import { useSession } from '@/lib/session';
import { useAuth } from '@/lib/auth';
import { OnboardingOverlay, useOnboardingVisible } from '@/components/onboarding';
import {
  Button,
  Card,
  EmptyState,
  ErrorNotice,
  PersonCard,
  RoleBadge,
  SessionStatusBadge,
} from '@/components/ui';

const CAN_MANAGE_ROLES = new Set(['admin', 'facilitator']);
const CAN_REVIEW_ROLES = new Set(['admin', 'reviewer']);

/** Session type is free text (not a fixed set), so this is a display formatter, not a lookup table. */
function formatSessionType(sessionType: string): string {
  const spaced = sessionType.replace(/_/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export default function WorkspacePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user, ready } = useSession();
  const { currentUser } = useAuth();
  const [onboardingVisible, dismissOnboarding] = useOnboardingVisible(id);

  const [workspace, setWorkspace] = useState<WorkspaceSummary | null>(null);
  const [organisation, setOrganisation] = useState<OrganisationSummary | null>(null);
  const [members, setMembers] = useState<WorkspaceMembershipView[]>([]);
  const [sessions, setSessions] = useState<CoDesignSessionSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [editingAbout, setEditingAbout] = useState(false);
  const [aboutDraft, setAboutDraft] = useState('');
  const [savingAbout, setSavingAbout] = useState(false);

  const load = useCallback(
    async (cancelledRef: { current: boolean }) => {
      try {
        const [workspaceResult, organisationsResult, membersResult, sessionsResult] =
          await Promise.all([
            api.getWorkspace(id, user),
            api.listOrganisations(user),
            api.listWorkspaceMemberships(id, user),
            api.listSessions(id, user),
          ]);
        if (cancelledRef.current) return;

        setWorkspace(workspaceResult);
        setOrganisation(
          organisationsResult.organisations.find((o) => o.id === workspaceResult.organisationId) ??
            null,
        );
        setMembers(membersResult.memberships);
        setSessions(sessionsResult.sessions);
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

  const role = currentUser?.workspaces.find((w) => w.id === id)?.role ?? null;
  const canManage = role !== null && CAN_MANAGE_ROLES.has(role);
  const canReview = role !== null && CAN_REVIEW_ROLES.has(role);

  const openSession = sessions.find((s) => s.status === 'open') ?? null;
  const upcomingSessions = sessions
    .filter((s) => s.status === 'draft' || s.status === 'scheduled')
    .slice(0, 3);
  const recentSessions = sessions.filter((s) => s.status === 'closed').slice(0, 3);

  const startEditingAbout = () => {
    setAboutDraft(workspace?.description ?? '');
    setEditingAbout(true);
  };

  const saveAbout = async () => {
    setSavingAbout(true);
    try {
      const updated = await api.updateWorkspace(
        id,
        { description: aboutDraft.trim() === '' ? null : aboutDraft.trim() },
        user,
      );
      setWorkspace(updated);
      setEditingAbout(false);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Something went wrong.');
    } finally {
      setSavingAbout(false);
    }
  };

  if (loading) {
    return <p className="text-[var(--color-ink-muted)]">Loading…</p>;
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
    <div className="space-y-8">
      {onboardingVisible && role !== null && (
        <OnboardingOverlay
          workspaceName={workspace.name}
          organisationName={organisation?.name ?? 'this organisation'}
          description={workspace.description}
          memberCount={members.length}
          onDismiss={dismissOnboarding}
        />
      )}

      <Link href="/workspaces" className="inline-block text-sm underline">
        ← Back to programs
      </Link>

      {error !== null && <ErrorNotice message={error} />}

      {/* Welcome */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-[var(--color-ink-muted)]">
            {organisation === null ? 'A co-design program' : `Hosted by ${organisation.name}`}
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">{workspace.name}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {role !== null && (
            <span className="text-sm text-[var(--color-ink-muted)]">
              You&rsquo;re participating as <RoleBadge role={role} />
            </span>
          )}
          <Link
            href={`/workspaces/${id}/agenda`}
            className="rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-1.5 text-sm font-medium hover:bg-[var(--color-accent-soft)]"
          >
            Agenda →
          </Link>
          <Link
            href={`/workspaces/${id}/resources`}
            className="rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-1.5 text-sm font-medium hover:bg-[var(--color-accent-soft)]"
          >
            Resources →
          </Link>
          <Link
            href={`/workspaces/${id}/search`}
            className="rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-1.5 text-sm font-medium hover:bg-[var(--color-accent-soft)]"
          >
            Search →
          </Link>
          {canReview && (
            <Link
              href={`/workspaces/${id}/review`}
              className="rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-1.5 text-sm font-medium hover:bg-[var(--color-accent-soft)]"
            >
              Needs your review →
            </Link>
          )}
          {canManage && (
            <Link
              href={`/workspaces/${id}/manage`}
              className="rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-1.5 text-sm font-medium hover:bg-[var(--color-accent-soft)]"
            >
              Manage program →
            </Link>
          )}
        </div>
      </div>

      {/* About */}
      <section aria-labelledby="about-heading" className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 id="about-heading" className="text-lg font-semibold">
            About this program
          </h2>
          {canManage && !editingAbout && (
            <button
              type="button"
              onClick={startEditingAbout}
              className="text-sm underline hover:no-underline"
            >
              {workspace.description === null ? 'Add a description' : 'Edit'}
            </button>
          )}
        </div>
        {editingAbout ? (
          <Card className="space-y-3">
            <label htmlFor="about" className="sr-only">
              About this program
            </label>
            <textarea
              id="about"
              rows={4}
              maxLength={4000}
              value={aboutDraft}
              onChange={(event) => setAboutDraft(event.target.value)}
              placeholder="Why this co-design exists, what it hopes to achieve, and who it's for."
              className="w-full rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2"
            />
            <div className="flex gap-2">
              <Button variant="primary" disabled={savingAbout} onClick={() => void saveAbout()}>
                {savingAbout ? 'Saving…' : 'Save'}
              </Button>
              <Button
                variant="secondary"
                disabled={savingAbout}
                onClick={() => setEditingAbout(false)}
              >
                Cancel
              </Button>
            </div>
          </Card>
        ) : workspace.description !== null ? (
          <Card>
            <p className="whitespace-pre-wrap text-sm">{workspace.description}</p>
          </Card>
        ) : (
          <EmptyState
            title="No description yet"
            body={
              canManage
                ? "Tell participants why this co-design exists and what it hopes to achieve — it's the first thing they read."
                : 'The facilitators preparing this program haven’t added a description yet.'
            }
            action={
              canManage ? (
                <Button variant="secondary" onClick={startEditingAbout}>
                  Add a description
                </Button>
              ) : undefined
            }
          />
        )}
      </section>

      {/* Now / Sessions */}
      <section aria-labelledby="sessions-heading" className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 id="sessions-heading" className="text-lg font-semibold">
            Sessions
          </h2>
          <Link
            href={`/workspaces/${id}/sessions`}
            className="text-sm underline hover:no-underline"
          >
            See all →
          </Link>
        </div>

        <Link
          href={`/workspaces/${id}/live`}
          className="block rounded-lg focus-visible:outline-none"
        >
          <Card className="border-[var(--color-accent)] bg-[var(--color-accent-soft)]">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-accent)]">
              Now →
            </p>
            <p className="mt-1 text-sm">See what&rsquo;s happening in this program right now.</p>
          </Card>
        </Link>

        {openSession !== null && (
          <Link
            href={`/workspaces/${id}/sessions/${openSession.id}`}
            className="block rounded-lg focus-visible:outline-none"
          >
            <Card>
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">
                Open session
              </p>
              <p className="mt-1 font-medium">{openSession.title}</p>
              <p className="text-sm text-[var(--color-ink-muted)]">
                {formatSessionType(openSession.sessionType)}
              </p>
            </Card>
          </Link>
        )}

        {sessions.length === 0 ? (
          <EmptyState
            title="No sessions yet"
            body={
              canManage
                ? 'Create the first session in this program to start capturing the conversation.'
                : 'Sessions will appear here once a facilitator schedules one.'
            }
            action={
              canManage ? (
                <Link href={`/workspaces/${id}/sessions/new`}>
                  <Button variant="secondary">Create a session</Button>
                </Link>
              ) : undefined
            }
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {[...upcomingSessions, ...recentSessions]
              .filter((s) => s.id !== openSession?.id)
              .slice(0, 4)
              .map((session) => (
                <Link
                  key={session.id}
                  href={`/workspaces/${id}/sessions/${session.id}`}
                  className="block rounded-lg focus-visible:outline-none"
                >
                  <Card className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{session.title}</p>
                      <p className="truncate text-sm text-[var(--color-ink-muted)]">
                        {formatSessionType(session.sessionType)}
                      </p>
                    </div>
                    <SessionStatusBadge status={session.status} />
                  </Card>
                </Link>
              ))}
          </div>
        )}
      </section>

      {/* People */}
      <section aria-labelledby="people-heading" className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 id="people-heading" className="text-lg font-semibold">
            People
          </h2>
          <Link href={`/workspaces/${id}/people`} className="text-sm underline hover:no-underline">
            See everyone →
          </Link>
        </div>
        {members.length === 0 ? (
          <EmptyState
            title="No one has joined yet"
            body={
              canManage
                ? 'Invite the people who will take part in this co-design.'
                : 'Participants will appear here as they join this program.'
            }
            action={
              canManage ? (
                <Link href={`/workspaces/${id}/manage`}>
                  <Button variant="secondary">Invite people</Button>
                </Link>
              ) : undefined
            }
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {members.slice(0, 4).map((member) => (
              <PersonCard
                key={member.id}
                name={member.userDisplayName}
                bio={member.userBio}
                href={`/workspaces/${id}/people`}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
