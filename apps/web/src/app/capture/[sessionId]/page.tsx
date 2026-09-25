'use client';

/**
 * The participant session landing page and Quick Capture recorder (Phase 5,
 * Workstreams 1.1-1.5) — where someone lands immediately after joining via
 * QR/link. Deliberately outside the application `Shell` (no admin nav — see
 * `components/shell.tsx`'s `BARE_ROUTE_PREFIXES`): programme, session,
 * facilitator, and consent state, then contribution options. Nothing else.
 *
 * Consent is never assumed from joining alone (Workstream 1.3): a
 * participant who has not yet granted the session's required categories
 * sees a short consent form here before the recorder appears at all — the
 * same `mayParticipate`-fails-closed rule the API already enforces, made
 * visible rather than surfacing as a rejected submission.
 *
 * Offline resilience (Workstream 1.8) integrates with the existing queue
 * (`lib/offline-queue.ts`) rather than inventing a second one: a submission
 * that fails on a genuine network error is queued with the same
 * `clientRequestId` idempotency discipline the facilitator capture path
 * already relies on, and flushed automatically once the browser's `online`
 * event fires.
 */

import { useCallback, useEffect, useState } from 'react';
import { use } from 'react';

import type { ParticipantCaptureContextView } from '@witness/contracts';

import { api, ApiError } from '@/lib/api';
import { AudioRecorder } from '@/components/audio-recorder';
import { MicroSurvey } from '@/components/micro-survey';
import { Card, ErrorNotice, categoryLabel } from '@/components/ui';
import { type CaptureSession, loadCaptureSession } from '@/lib/capture-session';
import {
  enqueue,
  isNetworkFailure,
  listForParticipantSession,
  remove as removeQueued,
  updateStatus as updateQueuedStatus,
  type QueuedParticipantContribution,
} from '@/lib/offline-queue';

function newClientRequestId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`;
}

function extensionFor(mimeType: string): string {
  return mimeType.split(';')[0]?.split('/')[1] ?? 'webm';
}

/**
 * Quick Capture always attributes via `attributionModeFor` on the server
 * (`participant-capture.service.ts`) — 'named' -> 'attributed',
 * 'pseudonymous'/'anonymous' -> 'anonymous' — and `requiredConsentCategoryForCapture`
 * in the evidence domain unconditionally requires the matching quotation
 * category for any non-sourceless mode, regardless of whether a template
 * marked it "optional". Shown here as its own checkbox alongside the
 * session's configured required categories, so a participant only sees
 * "consent not granted" once, not as a rejected submission after recording.
 */
function quotationCategoryFor(identityMode: ParticipantCaptureContextView['identityMode']): string {
  return identityMode === 'named' ? 'attributed_quotation' : 'anonymous_quotation';
}

/**
 * `categoryLabel()` (`components/ui.tsx`) is shared with the facilitator
 * consent matrix and phrased in the third person ("Quoting them
 * anonymously") — correct there, but read back to the person themselves it
 * should say "me". Only the two quotation categories need a first-person
 * override; the rest already read fine after "I agree to".
 */
function firstPersonLabel(category: string): string {
  if (category === 'anonymous_quotation') return 'being quoted anonymously';
  if (category === 'attributed_quotation') return 'being quoted by name';
  return categoryLabel(category).toLowerCase();
}

function consentCategoriesFor(context: ParticipantCaptureContextView): string[] {
  const quotation = quotationCategoryFor(context.identityMode);
  return context.requiredConsentCategories.includes(quotation)
    ? context.requiredConsentCategories
    : [...context.requiredConsentCategories, quotation];
}

export default function ParticipantCapturePage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = use(params);

  const [session, setSession] = useState<CaptureSession | null | undefined>(undefined);
  const [context, setContext] = useState<ParticipantCaptureContextView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [consentSelections, setConsentSelections] = useState<Record<string, boolean>>({});
  const [consentBusy, setConsentBusy] = useState(false);
  const [consentError, setConsentError] = useState<string | null>(null);
  const [consentGranted, setConsentGranted] = useState(false);
  const [submitBusy, setSubmitBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submittedCount, setSubmittedCount] = useState(0);
  const [queued, setQueued] = useState<QueuedParticipantContribution[]>([]);

  useEffect(() => {
    setSession(loadCaptureSession(sessionId));
  }, [sessionId]);

  const loadContext = useCallback(async (captureToken: string) => {
    try {
      const result = await api.getParticipantCaptureContext(captureToken);
      setContext(result);
      setLoadError(null);
    } catch (caught) {
      setLoadError(caught instanceof ApiError ? caught.message : 'Something went wrong.');
    }
  }, []);

  useEffect(() => {
    if (session === null || session === undefined) return;
    void loadContext(session.captureToken);
  }, [session, loadContext]);

  const refreshQueued = useCallback(async () => {
    setQueued(await listForParticipantSession(sessionId));
  }, [sessionId]);

  const flushQueue = useCallback(async () => {
    if (session === null || session === undefined) return;
    const pending = (await listForParticipantSession(sessionId)).filter(
      (item) => item.status === 'pending' || item.status === 'failed',
    );
    for (const item of pending) {
      await updateQueuedStatus(item.id, 'syncing');
      try {
        const result = await api.captureParticipantEvidence(item.captureToken, item.body);
        if (item.attachment !== null) {
          await api.uploadParticipantCaptureAttachment(
            item.captureToken,
            result.evidenceId,
            item.attachment.blob,
            item.attachment.filename,
          );
        }
        await removeQueued(item.id);
        setSubmittedCount((count) => count + 1);
      } catch (caught) {
        if (isNetworkFailure(caught)) {
          await updateQueuedStatus(item.id, 'pending');
        } else {
          const message = caught instanceof ApiError ? caught.message : 'Failed to submit.';
          await updateQueuedStatus(item.id, 'failed', message);
        }
      }
    }
    await refreshQueued();
  }, [session, sessionId, refreshQueued]);

  useEffect(() => {
    void refreshQueued();
    void flushQueue();
    const onOnline = () => void flushQueue();
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [refreshQueued, flushQueue]);

  const submitConsent = async () => {
    if (session === null || session === undefined || context === null) return;
    setConsentBusy(true);
    setConsentError(null);
    try {
      await api.captureParticipantSelfConsent(session.captureToken, {
        categoryDecisions: consentCategoriesFor(context).map((category) => ({
          category,
          granted: consentSelections[category] === true,
        })),
      });
      setConsentGranted(true);
    } catch (caught) {
      setConsentError(caught instanceof ApiError ? caught.message : 'Something went wrong.');
    } finally {
      setConsentBusy(false);
    }
  };

  const submitRecording = async (blob: Blob, mimeType: string, durationSeconds: number) => {
    if (session === null || session === undefined) return;
    setSubmitBusy(true);
    setSubmitError(null);
    const clientRequestId = newClientRequestId();
    const filename = `contribution-${new Date().toISOString()}.${extensionFor(mimeType)}`;
    const body = {
      evidenceType: 'audio_note',
      title: `Contribution — ${new Date().toLocaleString()}`,
      content: 'Audio contribution recorded via Quick Capture.',
      sessionOffsetSeconds: durationSeconds,
      clientRequestId,
    };

    try {
      const result = await api.captureParticipantEvidence(session.captureToken, body);
      await api.uploadParticipantCaptureAttachment(
        session.captureToken,
        result.evidenceId,
        blob,
        filename,
      );
      setSubmittedCount((count) => count + 1);
    } catch (caught) {
      if (isNetworkFailure(caught)) {
        try {
          await enqueue({
            kind: 'participant',
            id: clientRequestId,
            sessionId,
            captureToken: session.captureToken,
            body,
            attachment: { blob, filename },
            status: 'pending',
            createdAt: Date.now(),
            lastError: null,
          });
          await refreshQueued();
        } catch {
          // IndexedDB unavailable or quota-exceeded (private browsing,
          // full storage) — without this, enqueue()'s rejection would
          // propagate as an unhandled promise rejection and the recording
          // would be silently lost with no message at all. Tell the
          // participant plainly rather than losing their contribution
          // silently.
          setSubmitError(
            "Couldn't save this offline — your device's storage may be full or unavailable. " +
              'Try again once you have a connection.',
          );
        }
      } else {
        setSubmitError(caught instanceof ApiError ? caught.message : 'Something went wrong.');
      }
    } finally {
      setSubmitBusy(false);
    }
  };

  const retryQueuedNow = () => void flushQueue();

  if (session === undefined) {
    return (
      <p
        role="status"
        className="flex min-h-dvh items-center justify-center text-[var(--color-ink-muted)]"
      >
        Loading…
      </p>
    );
  }

  if (session === null) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-4 text-center">
        <ErrorNotice message="No active session found on this device. Ask your facilitator for the join link or QR code." />
      </div>
    );
  }

  if (loadError !== null) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-4 text-center">
        <ErrorNotice message={loadError} />
      </div>
    );
  }

  if (context === null) {
    return (
      <p
        role="status"
        className="flex min-h-dvh items-center justify-center text-[var(--color-ink-muted)]"
      >
        Loading…
      </p>
    );
  }

  const hasConsentSetup = context.requiredConsentCategories.length > 0;
  const needsConsent =
    hasConsentSetup && context.consentStatusSummary !== 'granted' && !consentGranted;

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 px-4 py-8">
      <div className="space-y-1 text-center">
        <h1 className="text-xl font-semibold tracking-tight text-balance">
          {context.sessionTitle}
        </h1>
        <p className="text-sm text-[var(--color-ink-muted)]">
          Facilitated by {context.facilitatorDisplayName}
        </p>
        <p className="text-xs text-[var(--color-ink-muted)]">
          Contributing as <strong>{context.displayName}</strong>
        </p>
      </div>

      {context.sessionStatus !== 'open' ? (
        <ErrorNotice message="This session is not currently open. Contributions cannot be recorded right now." />
      ) : !hasConsentSetup ? (
        <ErrorNotice message="This session hasn't been set up for self-capture yet. Ask your facilitator." />
      ) : needsConsent ? (
        <Card className="space-y-4">
          <p className="text-sm text-[var(--color-ink)]">
            Before you contribute, please tell us what you&rsquo;re comfortable with:
          </p>
          {consentError !== null && <ErrorNotice message={consentError} />}
          <div className="space-y-3">
            {consentCategoriesFor(context).map((category) => (
              <label key={category} className="flex items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  className="mt-1 h-5 w-5"
                  checked={consentSelections[category] === true}
                  onChange={(event) =>
                    setConsentSelections((prev) => ({ ...prev, [category]: event.target.checked }))
                  }
                />
                <span>I agree to {firstPersonLabel(category)}</span>
              </label>
            ))}
          </div>
          <button
            type="button"
            onClick={() => void submitConsent()}
            disabled={consentBusy}
            className="w-full rounded bg-[var(--color-accent)] px-4 py-4 text-base font-semibold text-[var(--color-accent-contrast)] disabled:opacity-50"
          >
            {consentBusy ? 'Saving…' : 'Continue'}
          </button>
        </Card>
      ) : (
        <div className="space-y-4">
          {submitError !== null && <ErrorNotice message={submitError} />}
          {submittedCount > 0 && (
            <>
              <p role="status" className="text-center text-sm text-[var(--color-ink)]">
                {submittedCount} contribution{submittedCount === 1 ? '' : 's'} submitted. Record
                another any time.
              </p>
              <MicroSurvey
                productArea="evidence_capture"
                question="How easy was it to contribute today?"
                submitFeedback={async (rating, comment) => {
                  const result = await api.captureParticipantFeedback(session.captureToken, {
                    rating,
                    comment,
                  });
                  return { feedbackId: result.id, offerTestimonial: result.offerTestimonial };
                }}
                submitTestimonialConsent={async (feedbackId, request) => {
                  await api.captureParticipantTestimonialConsent(
                    session.captureToken,
                    feedbackId,
                    request,
                  );
                }}
              />
            </>
          )}
          {queued.length > 0 && (
            <div className="flex items-center justify-center gap-2">
              <p role="status" className="text-center text-xs text-[var(--color-ink-muted)]">
                {queued.length} waiting to send once you&rsquo;re back online.
              </p>
              <button
                type="button"
                onClick={retryQueuedNow}
                className="text-xs font-medium text-[var(--color-accent)] underline"
              >
                Retry now
              </button>
            </div>
          )}
          <AudioRecorder
            onSubmit={(blob, mime, seconds) => void submitRecording(blob, mime, seconds)}
            submitting={submitBusy}
          />
        </div>
      )}
    </div>
  );
}
