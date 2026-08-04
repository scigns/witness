'use client';

/**
 * Create a co-design session (BUILD_ROADMAP.md Milestone 2).
 *
 * The facilitator picker is restricted to this workspace's members —
 * convenience only, the same reasoning `WorkspacePage`'s eligible-member
 * filter uses: the API would refuse a facilitator id from outside the
 * workspace regardless of what this dropdown offers, because
 * `SessionsService.create` validates the user exists but does not (yet)
 * require workspace membership — a known limitation named in this
 * milestone's PR, not hidden by only showing members here.
 */

import { useRouter } from 'next/navigation';
import { use, useEffect, useState, type FormEvent } from 'react';

import {
  SUGGESTED_SESSION_TYPES,
  type SessionDeliveryMode,
  type WorkspaceMembershipView,
} from '@witness/contracts';

import { api, ApiError } from '@/lib/api';
import { useSession } from '@/lib/session';
import { Button, Card, ErrorNotice } from '@/components/ui';

const DELIVERY_MODE_LABELS: Record<SessionDeliveryMode, string> = {
  in_person: 'In person',
  online: 'Online',
  hybrid: 'Hybrid',
  asynchronous: 'Asynchronous',
  other: 'Other',
};

const SESSION_TYPE_LABELS: Record<(typeof SUGGESTED_SESSION_TYPES)[number], string> = {
  co_design_workshop: 'Co-design workshop',
  community_consultation: 'Community consultation',
  talanoa: 'Talanoa',
  policy_meeting: 'Policy meeting',
  focus_group: 'Focus group',
  interview: 'Interview',
  training_workshop: 'Training workshop',
  internal_planning_session: 'Internal planning session',
  formal_proceeding: 'Formal proceeding',
  other: 'Other (name it below)',
};

export default function NewSessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: workspaceId } = use(params);
  const router = useRouter();
  const { user, ready } = useSession();

  const [members, setMembers] = useState<WorkspaceMembershipView[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(true);

  const [title, setTitle] = useState('');
  const [purpose, setPurpose] = useState('');
  const [sessionTypeChoice, setSessionTypeChoice] =
    useState<(typeof SUGGESTED_SESSION_TYPES)[number]>('co_design_workshop');
  const [customSessionType, setCustomSessionType] = useState('');
  const [deliveryMode, setDeliveryMode] = useState<SessionDeliveryMode>('in_person');
  const [primaryFacilitatorId, setPrimaryFacilitatorId] = useState('');
  const [location, setLocation] = useState('');
  const [culturalProtocolNotes, setCulturalProtocolNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!ready) return;

    let cancelled = false;

    void (async () => {
      setLoadingMembers(true);
      try {
        const result = await api.listWorkspaceMemberships(workspaceId, user);
        if (cancelled) return;
        setMembers(result.memberships);
        setPrimaryFacilitatorId((current) => current || (result.memberships[0]?.userId ?? ''));
      } catch (caught) {
        if (cancelled) return;
        setError(caught instanceof ApiError ? caught.message : 'Something went wrong.');
      } finally {
        if (!cancelled) setLoadingMembers(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [ready, workspaceId, user]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const sessionType =
      sessionTypeChoice === 'other' ? customSessionType.trim() : sessionTypeChoice;

    try {
      const created = await api.createSession(
        workspaceId,
        {
          title,
          purpose,
          sessionType,
          deliveryMode,
          primaryFacilitatorId,
          location: location.trim() === '' ? undefined : location,
          culturalProtocolNotes:
            culturalProtocolNotes.trim() === '' ? undefined : culturalProtocolNotes,
        },
        user,
      );
      router.push(`/workspaces/${workspaceId}/sessions/${created.id}`);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Something went wrong.');
      setBusy(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Create a co-design session</h1>
        <p className="mt-1 text-[var(--color-ink-muted)]">
          A session starts as a draft — schedule or open it once the details are right.
        </p>
      </div>

      {error !== null && <ErrorNotice message={error} />}

      {!loadingMembers && members.length === 0 ? (
        <Card>
          <p className="font-medium">No members in this workspace yet.</p>
          <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
            A session needs a primary facilitator — add a member to this workspace first.
          </p>
        </Card>
      ) : (
        <form onSubmit={(event) => void submit(event)} className="space-y-5">
          <Card className="space-y-4">
            <div>
              <label htmlFor="title" className="mb-1 block text-sm font-medium">
                Title <span aria-hidden="true">*</span>
                <span className="sr-only">(required)</span>
              </label>
              <input
                id="title"
                required
                maxLength={200}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Water access co-design workshop"
                className="w-full rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2"
              />
            </div>

            <div>
              <label htmlFor="purpose" className="mb-1 block text-sm font-medium">
                Purpose <span aria-hidden="true">*</span>
                <span className="sr-only">(required)</span>
              </label>
              <textarea
                id="purpose"
                required
                maxLength={2000}
                rows={3}
                value={purpose}
                onChange={(event) => setPurpose(event.target.value)}
                placeholder="Agree priorities for the next bore maintenance cycle."
                className="w-full rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="sessionType" className="mb-1 block text-sm font-medium">
                  Session type <span aria-hidden="true">*</span>
                  <span className="sr-only">(required)</span>
                </label>
                <select
                  id="sessionType"
                  value={sessionTypeChoice}
                  onChange={(event) =>
                    setSessionTypeChoice(
                      event.target.value as (typeof SUGGESTED_SESSION_TYPES)[number],
                    )
                  }
                  className="w-full rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2"
                >
                  {SUGGESTED_SESSION_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {SESSION_TYPE_LABELS[type]}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-[var(--color-ink-muted)]">
                  Not on the list? Choose &ldquo;Other&rdquo; and name your own protocol below —
                  session type is free text, not a fixed set.
                </p>
              </div>

              <div>
                <label htmlFor="deliveryMode" className="mb-1 block text-sm font-medium">
                  Delivery mode <span aria-hidden="true">*</span>
                  <span className="sr-only">(required)</span>
                </label>
                <select
                  id="deliveryMode"
                  value={deliveryMode}
                  onChange={(event) => setDeliveryMode(event.target.value as SessionDeliveryMode)}
                  className="w-full rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2"
                >
                  {Object.entries(DELIVERY_MODE_LABELS).map(([mode, label]) => (
                    <option key={mode} value={mode}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {sessionTypeChoice === 'other' && (
              <div>
                <label htmlFor="customSessionType" className="mb-1 block text-sm font-medium">
                  Name this session type <span aria-hidden="true">*</span>
                  <span className="sr-only">(required)</span>
                </label>
                <input
                  id="customSessionType"
                  required
                  maxLength={100}
                  value={customSessionType}
                  onChange={(event) => setCustomSessionType(event.target.value)}
                  placeholder="Talanoa, formal proceeding, community hui…"
                  className="w-full rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2"
                />
              </div>
            )}

            <div>
              <label htmlFor="primaryFacilitatorId" className="mb-1 block text-sm font-medium">
                Primary facilitator <span aria-hidden="true">*</span>
                <span className="sr-only">(required)</span>
              </label>
              <select
                id="primaryFacilitatorId"
                required
                disabled={loadingMembers}
                value={primaryFacilitatorId}
                onChange={(event) => setPrimaryFacilitatorId(event.target.value)}
                className="w-full rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2"
              >
                {loadingMembers && <option value="">Loading…</option>}
                {members.map((member) => (
                  <option key={member.userId} value={member.userId}>
                    {member.userDisplayName} ({member.userEmail})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="location" className="mb-1 block text-sm font-medium">
                Location
              </label>
              <input
                id="location"
                maxLength={300}
                value={location}
                onChange={(event) => setLocation(event.target.value)}
                placeholder="Community hall, or a meeting link"
                className="w-full rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2"
              />
            </div>

            <div>
              <label htmlFor="culturalProtocolNotes" className="mb-1 block text-sm font-medium">
                Cultural protocol notes
              </label>
              <textarea
                id="culturalProtocolNotes"
                maxLength={5000}
                rows={3}
                value={culturalProtocolNotes}
                onChange={(event) => setCulturalProtocolNotes(event.target.value)}
                placeholder="Opening and closing practices, who speaks first, anything facilitators must observe."
                className="w-full rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2"
              />
            </div>
          </Card>

          <div className="flex gap-2">
            <Button
              type="submit"
              variant="primary"
              disabled={
                busy ||
                title.trim() === '' ||
                purpose.trim() === '' ||
                primaryFacilitatorId === '' ||
                (sessionTypeChoice === 'other' && customSessionType.trim() === '')
              }
            >
              {busy ? 'Creating…' : 'Create session'}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
