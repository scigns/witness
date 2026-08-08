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
import { useSession } from '@/lib/session';
import { Button, Card, ErrorNotice, EvidenceReviewStatusBadge } from '@/components/ui';

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

export default function SessionEvidencePage({
  params,
}: {
  params: Promise<{ id: string; sessionId: string }>;
}) {
  const { id: workspaceId, sessionId } = use(params);
  const { user, ready } = useSession();

  const [session, setSession] = useState<CoDesignSessionDetail | null>(null);
  const [evidence, setEvidence] = useState<EvidenceSummary[]>([]);
  const [participants, setParticipants] = useState<SessionParticipantSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');

  const [evidenceType, setEvidenceType] = useState<string>('observation');
  const [customEvidenceType, setCustomEvidenceType] = useState('');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [attributionMode, setAttributionMode] =
    useState<EvidenceAttributionMode>('facilitator_observation');
  const [sourceParticipantId, setSourceParticipantId] = useState('');
  const [captureBusy, setCaptureBusy] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);

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

  const isSourceless = SOURCELESS_MODES.has(attributionMode);
  const resolvedType = evidenceType === 'other' ? customEvidenceType.trim() : evidenceType;

  const quickCapture = async (event: FormEvent) => {
    event.preventDefault();
    setCaptureBusy(true);
    setCaptureError(null);
    try {
      const captured = await api.captureEvidence(
        workspaceId,
        sessionId,
        {
          evidenceType: resolvedType,
          title: title.trim(),
          content: content.trim(),
          attributionMode,
          sourceParticipantId:
            isSourceless || sourceParticipantId === '' ? undefined : sourceParticipantId,
          submitImmediately: true,
        },
        user,
      );
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
      if (caught instanceof ApiError && caught.code === 'CONSENT_NOT_GRANTED') {
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
    return <p className="text-[var(--color-ink-muted)]">Loading…</p>;
  }

  if (forbidden) {
    return (
      <div className="space-y-4">
        <ErrorNotice message="You do not have permission to view this session's evidence." />
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
          Evidence{session !== null ? ` — ${session.title}` : ''}
        </h1>
        <p className="mt-1 text-[var(--color-ink-muted)]">
          What was said, observed, proposed, or objected to during this session, captured as it
          happens.
        </p>
      </div>

      {session !== null && !sessionOpen && (
        <p className="text-sm text-[var(--color-ink-muted)]" role="status">
          {session.status === 'closed' || session.status === 'archived'
            ? 'This session is not open, so new evidence cannot be captured. Existing evidence is still shown below.'
            : 'Open this session to start capturing evidence.'}
        </p>
      )}

      {sessionOpen && (
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
                  Name this evidence type <span aria-hidden="true">*</span>
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
              {captureBusy ? 'Capturing…' : 'Capture and submit'}
            </Button>
            <p className="text-xs text-[var(--color-ink-muted)]">
              Quick capture submits immediately. To save a draft you can edit later, open the full
              form from the evidence list below after a first capture.
            </p>
          </form>
        </Card>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor="statusFilter" className="text-sm font-medium">
          Filter by status
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
      </div>

      {evidence.length === 0 ? (
        <Card>
          <p className="text-sm text-[var(--color-ink-muted)]">
            No evidence captured yet{statusFilter !== '' ? ' for this filter' : ''}.
          </p>
        </Card>
      ) : (
        <ul className="space-y-3">
          {evidence.map((item) => (
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
                  {item.evidenceType.replace(/_/g, ' ')} ·{' '}
                  {ATTRIBUTION_MODE_LABELS[item.attributionMode]}
                  {' · '}
                  {new Date(item.capturedAt).toLocaleString()}
                </p>
                {item.tags.length > 0 && (
                  <p className="text-xs text-[var(--color-ink-muted)]">
                    Tags: {item.tags.join(', ')}
                  </p>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
