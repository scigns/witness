'use client';

/**
 * Program agenda (Client-Ready Experience overhaul, Phase 11). Every
 * participant reads this to orient: what's happening now, what's next, what
 * already happened. Facilitators and admins can add, reorder and move items
 * through upcoming → current → completed from the same page — there is no
 * separate "manage agenda" screen, because reading and running the agenda
 * are the same task at different moments in a session.
 */

import Link from 'next/link';
import { use, useCallback, useEffect, useState } from 'react';

import type { AgendaItemView, CoDesignSessionSummary, WorkspaceSummary } from '@witness/contracts';

import { api, ApiError } from '@/lib/api';
import { useSession } from '@/lib/session';
import { useAuth } from '@/lib/auth';
import { ProgramNav } from '@/components/program-nav';
import { Button, Card, EmptyState, ErrorNotice } from '@/components/ui';

const CAN_MANAGE_ROLES = new Set(['admin', 'facilitator']);

function formatDateTime(value: string | null): string | null {
  if (value === null) return null;
  return new Date(value).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

interface DraftState {
  title: string;
  description: string;
  promptText: string;
  sessionId: string;
  startAt: string;
  durationMinutes: string;
}

const EMPTY_DRAFT: DraftState = {
  title: '',
  description: '',
  promptText: '',
  sessionId: '',
  startAt: '',
  durationMinutes: '',
};

export default function AgendaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user, ready } = useSession();
  const { currentUser } = useAuth();

  const [workspace, setWorkspace] = useState<WorkspaceSummary | null>(null);
  const [sessions, setSessions] = useState<CoDesignSessionSummary[]>([]);
  const [items, setItems] = useState<AgendaItemView[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState<DraftState>(EMPTY_DRAFT);

  const load = useCallback(
    async (cancelledRef: { current: boolean }) => {
      try {
        const [workspaceResult, sessionsResult, itemsResult] = await Promise.all([
          api.getWorkspace(id, user),
          api.listSessions(id, user),
          api.listAgendaItems(id, user),
        ]);
        if (cancelledRef.current) return;
        setWorkspace(workspaceResult);
        setSessions(sessionsResult.sessions);
        setItems([...itemsResult.agendaItems].sort((a, b) => a.sortOrder - b.sortOrder));
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

  const createItem = async () => {
    if (draft.title.trim() === '') return;
    setBusy(true);
    try {
      await api.createAgendaItem(
        id,
        {
          title: draft.title.trim(),
          description: draft.description.trim() === '' ? null : draft.description.trim(),
          promptText: draft.promptText.trim() === '' ? null : draft.promptText.trim(),
          sessionId: draft.sessionId === '' ? null : draft.sessionId,
          startAt: draft.startAt === '' ? null : new Date(draft.startAt).toISOString(),
          durationMinutes: draft.durationMinutes === '' ? null : Number(draft.durationMinutes),
        },
        user,
      );
      setDraft(EMPTY_DRAFT);
      setShowForm(false);
      await load({ current: false });
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  const transition = async (itemId: string, status: AgendaItemView['status']) => {
    setBusy(true);
    try {
      await api.transitionAgendaItem(id, itemId, { status }, user);
      await load({ current: false });
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  const move = async (index: number, direction: -1 | 1) => {
    const other = index + direction;
    if (other < 0 || other >= items.length) return;
    const a = items[index];
    const b = items[other];
    if (a === undefined || b === undefined) return;

    setBusy(true);
    try {
      await api.reorderAgendaItem(id, a.id, { sortOrder: b.sortOrder }, user);
      await api.reorderAgendaItem(id, b.id, { sortOrder: a.sortOrder }, user);
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

  return (
    <div className="space-y-6">
      <Link href={`/workspaces/${id}`} className="inline-block text-sm underline">
        ← Back to program
      </Link>

      {error !== null && <ErrorNotice message={error} />}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <p className="text-sm font-medium text-[var(--color-accent)]">{workspace.name}</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Agenda</h1>
          <p className="mt-2 text-[var(--color-ink-muted)]">
            See what is happening now, what comes next and what has already been completed in this
            program.
          </p>
        </div>

        {canManage && !showForm && (
          <Button variant="primary" onClick={() => setShowForm(true)}>
            Add agenda item
          </Button>
        )}
      </div>

      <ProgramNav workspaceId={id} role={role} />

      {canManage && showForm && (
        <Card className="space-y-3">
          <div>
            <label htmlFor="agenda-title" className="mb-1 block text-sm font-medium">
              Title
            </label>
            <input
              id="agenda-title"
              value={draft.title}
              onChange={(event) => setDraft({ ...draft, title: event.target.value })}
              maxLength={200}
              className="w-full rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2"
              placeholder="Welcome and introductions"
            />
          </div>
          <div>
            <label htmlFor="agenda-description" className="mb-1 block text-sm font-medium">
              Description
            </label>
            <textarea
              id="agenda-description"
              rows={2}
              value={draft.description}
              onChange={(event) => setDraft({ ...draft, description: event.target.value })}
              maxLength={4000}
              className="w-full rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2"
            />
          </div>
          <div>
            <label htmlFor="agenda-prompt" className="mb-1 block text-sm font-medium">
              Prompt for participants (shown while this item is running)
            </label>
            <textarea
              id="agenda-prompt"
              rows={2}
              value={draft.promptText}
              onChange={(event) => setDraft({ ...draft, promptText: event.target.value })}
              maxLength={4000}
              className="w-full rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2"
              placeholder="What should participants respond to during this item?"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label htmlFor="agenda-session" className="mb-1 block text-sm font-medium">
                Linked session (optional)
              </label>
              <select
                id="agenda-session"
                value={draft.sessionId}
                onChange={(event) => setDraft({ ...draft, sessionId: event.target.value })}
                className="w-full rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2"
              >
                <option value="">None</option>
                {sessions.map((session) => (
                  <option key={session.id} value={session.id}>
                    {session.title}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="agenda-start" className="mb-1 block text-sm font-medium">
                Start time (optional)
              </label>
              <input
                id="agenda-start"
                type="datetime-local"
                value={draft.startAt}
                onChange={(event) => setDraft({ ...draft, startAt: event.target.value })}
                className="w-full rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2"
              />
            </div>
            <div>
              <label htmlFor="agenda-duration" className="mb-1 block text-sm font-medium">
                Duration, minutes (optional)
              </label>
              <input
                id="agenda-duration"
                type="number"
                min={1}
                value={draft.durationMinutes}
                onChange={(event) => setDraft({ ...draft, durationMinutes: event.target.value })}
                className="w-full rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="primary"
              disabled={busy || draft.title.trim() === ''}
              onClick={() => void createItem()}
            >
              Add to agenda
            </Button>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => {
                setShowForm(false);
                setDraft(EMPTY_DRAFT);
              }}
            >
              Cancel
            </Button>
          </div>
        </Card>
      )}

      {items.length === 0 ? (
        <EmptyState
          title="No agenda yet"
          body={
            canManage
              ? 'Add the first item to give participants a sense of what to expect.'
              : 'A facilitator hasn’t published an agenda for this program yet.'
          }
        />
      ) : (
        <ul className="space-y-3">
          {items.map((item, index) => {
            const session = sessions.find((s) => s.id === item.sessionId) ?? null;
            const when = formatDateTime(item.startAt);

            return (
              <li key={item.id}>
                <Card
                  className={
                    item.status === 'current'
                      ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)]'
                      : item.status === 'completed'
                        ? 'opacity-70'
                        : ''
                  }
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      {item.status === 'current' && (
                        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-accent)]">
                          Happening now
                        </p>
                      )}
                      <p className="font-medium">{item.title}</p>
                      <p className="mt-0.5 text-sm text-[var(--color-ink-muted)]">
                        {[
                          when,
                          item.durationMinutes !== null ? `${item.durationMinutes} min` : null,
                          item.facilitatorName !== null
                            ? `Facilitated by ${item.facilitatorName}`
                            : null,
                          session !== null ? session.title : null,
                        ]
                          .filter(Boolean)
                          .join(' · ') || 'Not yet scheduled'}
                      </p>
                      {item.description !== null && (
                        <p className="mt-2 whitespace-pre-wrap text-sm">{item.description}</p>
                      )}
                      {item.promptText !== null && item.status === 'current' && (
                        <p className="mt-2 rounded border border-[var(--color-accent)] bg-[var(--color-paper)] px-3 py-2 text-sm font-medium">
                          {item.promptText}
                        </p>
                      )}
                    </div>

                    {canManage && (
                      <div className="flex shrink-0 flex-col items-end gap-2">
                        <div className="flex gap-1">
                          <Button
                            variant="secondary"
                            disabled={busy || index === 0}
                            onClick={() => void move(index, -1)}
                            aria-label={`Move "${item.title}" earlier in the agenda`}
                          >
                            <span aria-hidden="true">↑</span>
                          </Button>
                          <Button
                            variant="secondary"
                            disabled={busy || index === items.length - 1}
                            onClick={() => void move(index, 1)}
                            aria-label={`Move "${item.title}" later in the agenda`}
                          >
                            <span aria-hidden="true">↓</span>
                          </Button>
                        </div>
                        <div className="flex flex-wrap justify-end gap-2">
                          {item.status !== 'current' && (
                            <Button
                              variant="primary"
                              disabled={busy}
                              onClick={() => void transition(item.id, 'current')}
                            >
                              Start now
                            </Button>
                          )}
                          {item.status === 'current' && (
                            <Button
                              variant="secondary"
                              disabled={busy}
                              onClick={() => void transition(item.id, 'completed')}
                            >
                              Mark complete
                            </Button>
                          )}
                          {item.status === 'completed' && (
                            <Button
                              variant="secondary"
                              disabled={busy}
                              onClick={() => void transition(item.id, 'upcoming')}
                            >
                              Reopen
                            </Button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
