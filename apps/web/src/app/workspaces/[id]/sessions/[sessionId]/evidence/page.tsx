'use client';

/**
 * Session evidence feed (BUILD_ROADMAP.md Milestone 5, Structured Live
 * Evidence Capture) — the capture-while-facilitating screen.
 *
 * The quick-capture form at the top is deliberately the smallest possible
 * surface: evidence type, a few words, and (for anything said or done by a
 * specific participant) who it came from and how to attribute it. Everything
 * else a full record could carry — tags, a session-relative timestamp,
 * detailed notes — is left to the draft's own detail page, reachable the
 * moment the quick capture lands, so a facilitator never has to stop and
 * fill out a long form mid-conversation to get a thought captured at all.
 *
 * Only `open` sessions show the capture form — `EvidenceService.capture`
 * would reject it anyway, but surfacing that as a disabled form here (with
 * an explanation) is friendlier than letting a facilitator type a paragraph
 * only to have it rejected on submit.
 */

import Link from 'next/link';
import { use, useCallback, useEffect, useState, type FormEvent } from 'react';

import {
  SUGGESTED_EVIDENCE_TYPES,
  type CoDesignSessionDetail,
  type EvidenceAttributionMode,
  type EvidenceSummary,
  type SessionParticipantSummary,
} from '@witness/contracts';

import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useSession } from '@/lib/session';
import { Button, Card, EmptyState, ErrorNotice, EvidenceReviewStatusBadge } from '@/components/ui';
import {
  enqueue,
  isNetworkFailure,
  listForSession,
  remove as removeQueued,
  updateStatus as updateQueuedStatus,
  type QueuedContribution,
} from '@/lib/offline-queue';

const ATTRIBUTION_MODE_LABELS: Record<EvidenceAttributionMode, string> = {
  attributed: 'Attributed — names the participant',
  pseudonymous: 'Pseudonymous — shows their chosen name',
  anonymous: 'Anonymous — no identifying detail',
  facilitator_observation: "Facilitator's own observation (no participant)",
  institutional_source: 'Institutional source (no participant)',
  unattributed: 'Unattributed (no participant)',
};

const SOURCELESS_MODES: ReadonlySet<EvidenceAttributionMode> = new Set([
  'facilitator_observation',
  'institutional_source',
  'unattributed',
]);

/** Plain labels for the register's "Attachment" column — never the raw MIME type. */
const ATTACHMENT_KIND_LABELS: Record<string, string> = {
  audio: 'Audio',
  document: 'Document',
  image: 'Image',
};

const TRANSCRIPT_STATUS_LABELS: Record<string, string> = {
  pending: 'Transcription pending',
  processing: 'Transcribing…',
  completed: 'Transcribed',
  failed: 'Transcription failed',
};

/** Short attribution label for the register's "Source" column, distinct from the full quick-capture option text. */
const SOURCE_LABELS: Record<EvidenceAttributionMode, string> = {
  attributed: 'Named',
  pseudonymous: 'Pseudonym',
  anonymous: 'Anonymous',
  facilitator_observation: "Facilitator's observation",
  institutional_source: 'Institutional source',
  unattributed: 'Unattributed',
};

export default function SessionEvidencePage({
  params,
}: {
  params: Promise<{ id: string; sessionId: string }>;
}) {
  const { id: workspaceId, sessionId } = use(params);
  const { user, ready } = useSession();
  const { currentUser } = useAuth();
  // Observer (`reader`) is calm read-access by design — the quick-capture
  // form is hidden rather than shown-then-403'd. Every other role may
  // genuinely have a reason to submit (a participant their own contribution,
  // a facilitator/admin running the session); the API remains the real
  // gate for all of them.
  const isObserver = currentUser?.workspaces.find((w) => w.id === workspaceId)?.role === 'reader';

  const [session, setSession] = useState<CoDesignSessionDetail | null>(null);
  const [evidence, setEvidence] = useState<EvidenceSummary[]>([]);
  const [participants, setParticipants] = useState<SessionParticipantSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [attachmentFilter, setAttachmentFilter] = useState('');

  const [evidenceType, setEvidenceType] = useState<string>('observation');
  const [customEvidenceType, setCustomEvidenceType] = useState('');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [attributionMode, setAttributionMode] =
    useState<EvidenceAttributionMode>('facilitator_observation');
  const [sourceParticipantId, setSourceParticipantId] = useState('');
  const [captureBusy, setCaptureBusy] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [queued, setQueued] = useState<QueuedContribution[]>([]);

  const load = useCallback(
    async (cancelledRef: { current: boolean }) => {
      try {
        const [sessionResult, evidenceResult, participantsResult] = await Promise.all([
          api.getSession(workspaceId, sessionId, user),
          api.listEvidence(
            workspaceId,
            sessionId,
            user,
            statusFilter === '' ? undefined : { reviewStatus: statusFilter },
          ),
          api.listParticipants(workspaceId, sessionId, user),
        ]);
        if (cancelledRef.current) return;
        setSession(sessionResult);
        setEvidence(evidenceResult.evidence);
        setParticipants(participantsResult.participants.filter((p) => !p.withdrawn));
        setError(null);
        setForbidden(false);
      } catch (caught) {
        if (cancelledRef.current) return;
        if (caught instanceof ApiError && caught.status === 403) {
          setForbidden(true);
        } else {
          setError(caught instanceof ApiError ? caught.message : 'Something went wrong.');
        }
      } finally {
        if (!cancelledRef.current) setLoading(false);
      }
    },
    [workspaceId, sessionId, user, statusFilter],
  );

  useEffect(() => {
    if (!ready) return;
    const cancelledRef = { current: false };
    void load(cancelledRef);
    return () => {
      cancelledRef.current = true;
    };
  }, [ready, load]);

  const refreshQueued = useCallback(async () => {
    setQueued(await listForSession(workspaceId, sessionId));
  }, [workspaceId, sessionId]);

  /**
   * Flushes anything the offline queue is still holding for this session.
   * Runs on mount (covers "closed the tab while offline, reopened later")
   * and on the browser's `online` event (covers "regained connectivity
   * mid-session"). `clientRequestId` makes a retry safe even if a previous
   * attempt actually reached the server before the connection dropped.
   */
  const flushQueue = useCallback(async () => {
    const pending = (await listForSession(workspaceId, sessionId)).filter(
      (item) => item.status === 'pending' || item.status === 'failed',
    );
    for (const item of pending) {
      await updateQueuedStatus(item.id, 'syncing');
      await refreshQueued();
      try {
        const captured = await api.captureEvidence(workspaceId, sessionId, item.body, user);
        await removeQueued(item.id);
        setEvidence((current) =>
          current.some((e) => e.id === captured.id)
            ? current
            : [
                {
                  id: captured.id,
                  sessionId: captured.sessionId,
                  evidenceType: captured.evidenceType,
                  title: captured.title,
                  attributionMode: captured.attributionMode,
                  identityVisibility: captured.identityVisibility,
                  reviewStatus: captured.reviewStatus,
                  verificationStatus: captured.verificationStatus,
                  tags: captured.tags,
                  capturedAt: captured.capturedAt,
                  updatedAt: captured.updatedAt,
                  withdrawn: captured.withdrawn,
                  ...(captured.sourceParticipantId !== undefined
                    ? { sourceParticipantId: captured.sourceParticipantId }
                    : {}),
                },
                ...current,
              ],
        );
      } catch (caught) {
        // Still offline, or a genuine rejection (consent refused, session
        // closed since queuing) — either way, leave it queued and visible
        // rather than silently dropping a participant's words.
        const message = caught instanceof ApiError ? caught.message : 'Sync failed.';
        await updateQueuedStatus(item.id, 'failed', message);
      }
      await refreshQueued();
    }
  }, [workspaceId, sessionId, user, refreshQueued]);

  useEffect(() => {
    void refreshQueued();
    void flushQueue();
    const onOnline = () => void flushQueue();
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [refreshQueued, flushQueue]);

  const isSourceless = SOURCELESS_MODES.has(attributionMode);
  const resolvedType = evidenceType === 'other' ? customEvidenceType.trim() : evidenceType;

  const quickCapture = async (event: FormEvent) => {
    event.preventDefault();
    setCaptureBusy(true);
    setCaptureError(null);

    const clientRequestId =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random()}`;

    const body = {
      evidenceType: resolvedType,
      title: title.trim(),
      content: content.trim(),
      attributionMode,
      sourceParticipantId:
        isSourceless || sourceParticipantId === '' ? undefined : sourceParticipantId,
      submitImmediately: true,
      clientRequestId,
    };

    try {
      const captured = await api.captureEvidence(workspaceId, sessionId, body, user);
      setEvidence((current) => [
        {
          id: captured.id,
          sessionId: captured.sessionId,
          evidenceType: captured.evidenceType,
          title: captured.title,
          attributionMode: captured.attributionMode,
          identityVisibility: captured.identityVisibility,
          reviewStatus: captured.reviewStatus,
          verificationStatus: captured.verificationStatus,
          tags: captured.tags,
          capturedAt: captured.capturedAt,
          updatedAt: captured.updatedAt,
          withdrawn: captured.withdrawn,
          ...(captured.sourceParticipantId !== undefined
            ? { sourceParticipantId: captured.sourceParticipantId }
            : {}),
        },
        ...current,
      ]);
      setTitle('');
      setContent('');
      setSourceParticipantId('');
    } catch (caught) {
      if (isNetworkFailure(caught)) {
        // No connection right now — queue it locally rather than losing
        // what was typed. `flushQueue` retries automatically once the
        // browser's `online` event fires.
        await enqueue({
          id: clientRequestId,
          workspaceId,
          sessionId,
          body,
          status: 'pending',
          createdAt: Date.now(),
          lastError: null,
        });
        await refreshQueued();
        setTitle('');
        setContent('');
        setSourceParticipantId('');
      } else if (caught instanceof ApiError && caught.code === 'CONSENT_NOT_GRANTED') {
        setCaptureError(
          `This cannot be captured this way: ${caught.message} Choose a different attribution mode, or check the participant's consent.`,
        );
      } else {
        setCaptureError(caught instanceof ApiError ? caught.message : 'Something went wrong.');
      }
    } finally {
      setCaptureBusy(false);
    }
  };

  if (loading) {
    return (
      <p role="status" className="text-[var(--color-ink-muted)]">
        Loading…
      </p>
    );
  }

  if (forbidden) {
    return (
      <div className="space-y-4">
        <ErrorNotice message="You do not have permission to view this session's contributions." />
        <Link
          href={`/workspaces/${workspaceId}/sessions/${sessionId}`}
          className="text-sm underline"
        >
          ← Back to session
        </Link>
      </div>
    );
  }

  const sessionOpen = session?.status === 'open';

  return (
    <div className="space-y-6">
      <Link
        href={`/workspaces/${workspaceId}/sessions/${sessionId}`}
        className="inline-block text-sm underline"
      >
        ← Back to session
      </Link>

      {error !== null && <ErrorNotice message={error} />}

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Contributions{session !== null ? ` — ${session.title}` : ''}
        </h1>
        <p className="mt-1 text-[var(--color-ink-muted)]">
          What was said, observed, proposed, or objected to during this session, captured as it
          happens.
        </p>
      </div>

      {session !== null && !sessionOpen && (
        <p className="text-sm text-[var(--color-ink-muted)]" role="status">
          {session.status === 'closed' || session.status === 'archived'
            ? 'This session is not open, so new contributions cannot be captured. Existing contributions are still shown below.'
            : 'Open this session to start capturing contributions.'}
        </p>
      )}

      {sessionOpen && !isObserver && (
        <Card className="space-y-4">
          <h2 className="text-lg font-semibold">Quick capture</h2>
          {captureError !== null && <ErrorNotice message={captureError} />}
          <form onSubmit={(event) => void quickCapture(event)} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="evidenceType" className="mb-1 block text-sm font-medium">
                  Type <span aria-hidden="true">*</span>
                  <span className="sr-only">(required)</span>
                </label>
                <select
                  id="evidenceType"
                  value={evidenceType}
                  onChange={(event) => setEvidenceType(event.target.value)}
                  className="w-full rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2"
                >
                  {SUGGESTED_EVIDENCE_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type.replace(/_/g, ' ')}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="attributionMode" className="mb-1 block text-sm font-medium">
                  Attribution <span aria-hidden="true">*</span>
                  <span className="sr-only">(required)</span>
                </label>
                <select
                  id="attributionMode"
                  value={attributionMode}
                  onChange={(event) => {
                    const mode = event.target.value as EvidenceAttributionMode;
                    setAttributionMode(mode);
                    if (SOURCELESS_MODES.has(mode)) setSourceParticipantId('');
                  }}
                  className="w-full rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2"
                >
                  {(Object.keys(ATTRIBUTION_MODE_LABELS) as EvidenceAttributionMode[]).map(
                    (mode) => (
                      <option key={mode} value={mode}>
                        {ATTRIBUTION_MODE_LABELS[mode]}
                      </option>
                    ),
                  )}
                </select>
              </div>
            </div>

            {evidenceType === 'other' && (
              <div>
                <label htmlFor="customEvidenceType" className="mb-1 block text-sm font-medium">
                  Name this type <span aria-hidden="true">*</span>
                  <span className="sr-only">(required)</span>
                </label>
                <input
                  id="customEvidenceType"
                  required
                  maxLength={100}
                  value={customEvidenceType}
                  onChange={(event) => setCustomEvidenceType(event.target.value)}
                  className="w-full rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2"
                />
              </div>
            )}

            {!isSourceless && (
              <div>
                <label htmlFor="sourceParticipantId" className="mb-1 block text-sm font-medium">
                  Source participant <span aria-hidden="true">*</span>
                  <span className="sr-only">(required)</span>
                </label>
                <select
                  id="sourceParticipantId"
                  required
                  value={sourceParticipantId}
                  onChange={(event) => setSourceParticipantId(event.target.value)}
                  className="w-full rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2"
                >
                  <option value="">Choose a participant…</option>
                  {participants.map((participant) => (
                    <option key={participant.id} value={participant.id}>
                      {participant.displayName}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label htmlFor="title" className="mb-1 block text-sm font-medium">
                Title <span aria-hidden="true">*</span>
                <span className="sr-only">(required)</span>
              </label>
              <input
                id="title"
                required
                maxLength={300}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Short summary, e.g. 'Wants more shade near the fountain'"
                className="w-full rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2"
              />
            </div>

            <div>
              <label htmlFor="content" className="mb-1 block text-sm font-medium">
                Content <span aria-hidden="true">*</span>
                <span className="sr-only">(required)</span>
              </label>
              <textarea
                id="content"
                required
                rows={3}
                maxLength={20000}
                value={content}
                onChange={(event) => setContent(event.target.value)}
                className="w-full rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2"
              />
            </div>

            <Button
              type="submit"
              variant="primary"
              disabled={
                captureBusy ||
                resolvedType === '' ||
                title.trim() === '' ||
                content.trim() === '' ||
                (!isSourceless && sourceParticipantId === '')
              }
            >
              {captureBusy ? 'Sharing…' : 'Share contribution'}
            </Button>
            <p className="text-xs text-[var(--color-ink-muted)]">
              Quick capture submits immediately. To save a draft you can edit later, open the full
              form from the list below after a first contribution.
            </p>
          </form>
        </Card>
      )}

      {queued.length > 0 && (
        <div role="status">
          <Card className="space-y-2 border-[var(--color-accent)] bg-[var(--color-accent-soft)]">
            <p className="text-sm font-medium">
              {queued.length} contribution{queued.length === 1 ? '' : 's'} saved on this device,
              waiting for a connection
            </p>
            <ul className="space-y-1 text-sm">
              {queued.map((item) => (
                <li key={item.id} className="flex flex-wrap items-center justify-between gap-2">
                  <span className="truncate">{item.body.title}</span>
                  <span className="shrink-0 text-xs text-[var(--color-ink-muted)]">
                    {item.status === 'syncing'
                      ? 'Syncing…'
                      : item.status === 'failed'
                        ? `Couldn't sync yet${item.lastError ? ` — ${item.lastError}` : ''}`
                        : 'Waiting to sync'}
                  </span>
                </li>
              ))}
            </ul>
            <Button variant="secondary" onClick={() => void flushQueue()}>
              Try syncing now
            </Button>
          </Card>
        </div>
      )}

      <EvidenceRegister
        workspaceId={workspaceId}
        sessionId={sessionId}
        evidence={evidence}
        participants={participants}
        statusFilter={statusFilter}
        setStatusFilter={setStatusFilter}
        attachmentFilter={attachmentFilter}
        setAttachmentFilter={setAttachmentFilter}
      />
    </div>
  );
}

/**
 * Evidence Register — a professional table on desktop (source, attachment
 * type, processing/review state, provenance link), the same information as
 * a stacked-card list below `md` (a wide table doesn't survive a narrow
 * viewport intact; see the consent matrix for the identical pattern).
 *
 * `attachmentFilter` is computed and applied client-side, not server-side —
 * the session's full evidence list is already loaded (up to 1000 items,
 * same limit the existing status filter works within), and adding a second
 * network round-trip for a filter over data already in memory would be
 * strictly worse, not more correct.
 */
function EvidenceRegister({
  workspaceId,
  sessionId,
  evidence,
  participants,
  statusFilter,
  setStatusFilter,
  attachmentFilter,
  setAttachmentFilter,
}: {
  workspaceId: string;
  sessionId: string;
  evidence: EvidenceSummary[];
  participants: SessionParticipantSummary[];
  statusFilter: string;
  setStatusFilter: (value: string) => void;
  attachmentFilter: string;
  setAttachmentFilter: (value: string) => void;
}) {
  const participantName = (id: string): string =>
    participants.find((p) => p.id === id)?.displayName ?? 'Unknown participant';

  const filtered = evidence.filter((item) => {
    if (attachmentFilter === '') return true;
    if (attachmentFilter === 'none') return item.attachmentKind === undefined;
    return item.attachmentKind === attachmentFilter;
  });

  const sourceLabel = (item: EvidenceSummary): string =>
    item.attributionMode === 'attributed' && item.sourceParticipantId !== undefined
      ? participantName(item.sourceParticipantId)
      : SOURCE_LABELS[item.attributionMode];

  const consentLabel = (item: EvidenceSummary): string =>
    SOURCELESS_MODES.has(item.attributionMode) ? '—' : 'Confirmed at capture';

  const processingLabel = (item: EvidenceSummary): string => {
    if (item.attachmentKind === undefined) return '—';
    if (item.transcriptStatus === undefined) return ATTACHMENT_KIND_LABELS[item.attachmentKind]!;
    return TRANSCRIPT_STATUS_LABELS[item.transcriptStatus] ?? item.transcriptStatus;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor="statusFilter" className="text-sm font-medium">
          Status
        </label>
        <select
          id="statusFilter"
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
          className="rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-1.5 text-sm"
        >
          <option value="">All</option>
          <option value="draft">Draft</option>
          <option value="submitted">Submitted</option>
          <option value="under_review">Under review</option>
          <option value="needs_clarification">Needs clarification</option>
          <option value="validated">Validated</option>
          <option value="rejected">Rejected</option>
          <option value="withdrawn">Withdrawn</option>
        </select>

        <label htmlFor="attachmentFilter" className="text-sm font-medium">
          Attachment
        </label>
        <select
          id="attachmentFilter"
          value={attachmentFilter}
          onChange={(event) => setAttachmentFilter(event.target.value)}
          className="rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-1.5 text-sm"
        >
          <option value="">All</option>
          <option value="audio">Audio</option>
          <option value="document">Document</option>
          <option value="image">Image</option>
          <option value="none">No attachment</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="No evidence yet"
          body={
            evidence.length === 0
              ? 'No evidence has been captured for this session yet. Use Quick capture above once the session is open.'
              : 'No evidence matches the current filters.'
          }
        />
      ) : (
        <>
          {/* Desktop / tablet: a real register. */}
          <div className="hidden overflow-x-auto rounded-lg border border-[var(--color-line)] md:block">
            <table className="w-full min-w-max border-collapse text-left text-sm">
              <caption className="sr-only">
                Evidence register — every contribution and its attachment, source, and review state
              </caption>
              <thead>
                <tr className="border-b border-[var(--color-line)] bg-[var(--color-paper-raised)]">
                  <th scope="col" className="py-2 pl-4 pr-4 font-medium">
                    Evidence
                  </th>
                  <th scope="col" className="py-2 pr-4 font-medium">
                    Source
                  </th>
                  <th scope="col" className="py-2 pr-4 font-medium">
                    Consent
                  </th>
                  <th scope="col" className="py-2 pr-4 font-medium">
                    Processing
                  </th>
                  <th scope="col" className="py-2 pr-4 font-medium">
                    Review
                  </th>
                  <th scope="col" className="py-2 pr-4 font-medium">
                    Captured
                  </th>
                  <th scope="col" className="py-2 pr-4 font-medium">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => (
                  <tr key={item.id} className="border-b border-[var(--color-line)] last:border-0">
                    <th scope="row" className="py-3 pl-4 pr-4 font-normal">
                      <Link
                        href={`/workspaces/${workspaceId}/sessions/${sessionId}/evidence/${item.id}`}
                        className="font-medium hover:underline"
                      >
                        {item.title}
                      </Link>
                      <p className="text-xs text-[var(--color-ink-muted)]">
                        {item.evidenceType.replace(/_/g, ' ')}
                      </p>
                    </th>
                    <td className="py-3 pr-4 whitespace-nowrap">{sourceLabel(item)}</td>
                    <td className="py-3 pr-4 whitespace-nowrap text-[var(--color-ink-muted)]">
                      {consentLabel(item)}
                    </td>
                    <td className="py-3 pr-4 whitespace-nowrap">{processingLabel(item)}</td>
                    <td className="py-3 pr-4">
                      <EvidenceReviewStatusBadge status={item.reviewStatus} />
                    </td>
                    <td className="py-3 pr-4 whitespace-nowrap text-[var(--color-ink-muted)]">
                      {new Date(item.capturedAt).toLocaleDateString()}
                    </td>
                    <td className="py-3 pr-4 whitespace-nowrap">
                      <Link
                        href={`/workspaces/${workspaceId}/sessions/${sessionId}/evidence/${item.id}`}
                        className="text-xs underline"
                      >
                        View provenance
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile: the same information, stacked. */}
          <ul className="space-y-3 md:hidden">
            {filtered.map((item) => (
              <li key={item.id}>
                <Card className="space-y-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Link
                      href={`/workspaces/${workspaceId}/sessions/${sessionId}/evidence/${item.id}`}
                      className="font-medium hover:underline"
                    >
                      {item.title}
                    </Link>
                    <EvidenceReviewStatusBadge status={item.reviewStatus} />
                  </div>
                  <p className="text-xs text-[var(--color-ink-muted)]">
                    {item.evidenceType.replace(/_/g, ' ')} · {sourceLabel(item)}
                  </p>
                  <p className="text-xs text-[var(--color-ink-muted)]">
                    {consentLabel(item)} · {processingLabel(item)}
                  </p>
                  <p className="text-xs text-[var(--color-ink-muted)]">
                    {new Date(item.capturedAt).toLocaleDateString()}
                  </p>
                </Card>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
