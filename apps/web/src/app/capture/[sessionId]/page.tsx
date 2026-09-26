'use client';

/**
 * The participant session landing page and Quick Capture recorder (Phase 5,
 * Workstreams 1.1-1.5; re-shaped for Phase 6, Track E into a live workshop
 * companion) — where someone lands immediately after joining via QR/link.
 * Deliberately outside the application `Shell` (no admin nav — see
 * `components/shell.tsx`'s `BARE_ROUTE_PREFIXES`): programme, session,
 * facilitator, and consent state, then contribution options. Nothing else.
 *
 * Consent is never assumed from joining alone (Workstream 1.3): a
 * participant who has not yet granted the session's required categories
 * sees a short consent form here before the recorder appears at all — the
 * same `mayParticipate`-fails-closed rule the API already enforces, made
 * visible rather than surfacing as a rejected submission.
 *
 * Track E reframes this from an unlimited upload form into a prompt/round
 * companion: the facilitator's current agenda item is shown as the thing to
 * respond to (or "no active prompt" is stated plainly, never silently
 * omitted); a submission moves through an explicit
 * sending -> received/saved-on-device lifecycle rather than accumulating a
 * bare count as the primary success signal; and after a contribution lands
 * the participant makes a deliberate choice about what happens next, rather
 * than being funnelled straight back into recording again. `MicroSurvey` is
 * held back until that choice is "I'm done for now" or the session itself
 * closes — never immediately after a contribution, mid-round.
 *
 * Offline resilience (Workstream 1.8) integrates with the existing queue
 * (`lib/offline-queue.ts`) rather than inventing a second one: a submission
 * that fails on a genuine network error is queued with the same
 * `clientRequestId` idempotency discipline the facilitator capture path
 * already relies on, and flushed automatically once the browser's `online`
 * event fires.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { use } from 'react';

import type {
  FeaturedInsightView,
  ParticipantCaptureContextView,
  ParticipantPromptView,
  ParticipantResponseType,
} from '@witness/contracts';

import { api, ApiError } from '@/lib/api';
import { AudioRecorder } from '@/components/audio-recorder';
import { MicroSurvey } from '@/components/micro-survey';
import { Card, ErrorNotice, categoryLabel } from '@/components/ui';
import { type CaptureSession, loadCaptureSession } from '@/lib/capture-session';
import {
  isReceived,
  shouldReturnToPromptAfterWaiting,
  shouldShowNextActionChoices,
  shouldShowSessionEndState,
  type PostSubmitChoice,
  type SubmitPhase,
} from '@/lib/live-workshop';
import {
  enqueue,
  isNetworkFailure,
  listForParticipantSession,
  remove as removeQueued,
  updateStatus as updateQueuedStatus,
  type QueuedParticipantContribution,
} from '@/lib/offline-queue';

/** How often the prompt and "what we're hearing" panels refresh in the background — a calm companion, not a live feed. */
const LIVE_STATE_POLL_MS = 20_000;

const RESPONSE_OPTIONS: { type: ParticipantResponseType; label: string }[] = [
  { type: 'reflects', label: 'This reflects what I heard' },
  { type: 'needs_nuance', label: 'Needs more nuance' },
  { type: 'missing_context', label: 'Something is missing' },
  { type: 'sees_differently', label: 'I see this differently' },
];

const BADGE_LABELS: Record<FeaturedInsightView['badge'], string> = {
  under_discussion: 'Under discussion',
  contested: 'Views differ',
  community_validated: 'Reflected by the room',
};

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

  const [prompt, setPrompt] = useState<ParticipantPromptView | null | undefined>(undefined);
  const [insights, setInsights] = useState<FeaturedInsightView[]>([]);
  const [insightsError, setInsightsError] = useState<string | null>(null);
  const [respondingTo, setRespondingTo] = useState<string | null>(null);
  const [responseError, setResponseError] = useState<string | null>(null);

  const [submitPhase, setSubmitPhase] = useState<SubmitPhase>('idle');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [postSubmitChoice, setPostSubmitChoice] = useState<PostSubmitChoice>(null);
  const [submittedCount, setSubmittedCount] = useState(0);
  const [queued, setQueued] = useState<QueuedParticipantContribution[]>([]);

  const promptIdRef = useRef<string | null>(null);

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

  const loadLiveState = useCallback(async () => {
    if (session === null || session === undefined) return;
    try {
      const nextPrompt = await api.getParticipantPrompt(session.captureToken);
      setPrompt(nextPrompt);
      // A brand-new current prompt while this device was quietly waiting
      // for one is exactly the moment "Wait for the next question" was
      // asking for — return to the recorder automatically rather than
      // making the participant notice and tap something themselves.
      if (
        shouldReturnToPromptAfterWaiting(
          postSubmitChoice,
          promptIdRef.current,
          nextPrompt?.id ?? null,
        )
      ) {
        setPostSubmitChoice(null);
        setSubmitPhase('idle');
      }
      promptIdRef.current = nextPrompt?.id ?? null;
    } catch {
      // Non-fatal: the prompt/insights panel is a companion to the primary
      // capture flow, not a gate on it. Leave the previous value in place.
    }
    try {
      const nextInsights = await api.getParticipantInsights(session.captureToken);
      setInsights(nextInsights);
      setInsightsError(null);
    } catch (caught) {
      setInsightsError(caught instanceof ApiError ? caught.message : null);
    }
  }, [session, postSubmitChoice]);

  useEffect(() => {
    if (session === null || session === undefined) return;
    void loadLiveState();
    const interval = window.setInterval(() => void loadLiveState(), LIVE_STATE_POLL_MS);
    return () => window.clearInterval(interval);
  }, [session, loadLiveState]);

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
    setSubmitPhase('sending');
    setSubmitError(null);
    const clientRequestId = newClientRequestId();
    const filename = `contribution-${new Date().toISOString()}.${extensionFor(mimeType)}`;
    const body = {
      evidenceType: 'audio_note',
      title: `Contribution — ${new Date().toLocaleString()}`,
      content: 'Audio contribution recorded via Quick Capture.',
      sessionOffsetSeconds: durationSeconds,
      // Preserves the prompt/round relationship the room is currently
      // organised around — `undefined` (open reflection) when no agenda
      // item is active, never a stale prompt id from a previous round.
      sourceAgendaItemId: prompt?.id,
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
      setSubmitPhase('received');
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
          setSubmitPhase('saved_offline');
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
          setSubmitPhase('failed');
        }
      } else {
        setSubmitError(caught instanceof ApiError ? caught.message : 'Something went wrong.');
        setSubmitPhase('failed');
      }
    }
  };

  const respondToInsight = async (insightId: string, responseType: ParticipantResponseType) => {
    if (session === null || session === undefined) return;
    setRespondingTo(insightId);
    setResponseError(null);
    try {
      await api.submitParticipantInsightResponse(session.captureToken, insightId, {
        responseType,
      });
      await loadLiveState();
    } catch (caught) {
      setResponseError(caught instanceof ApiError ? caught.message : 'Something went wrong.');
    } finally {
      setRespondingTo(null);
    }
  };

  const retryQueuedNow = () => void flushQueue();

  const startAnotherThought = () => {
    setSubmitPhase('idle');
    setPostSubmitChoice(null);
    setSubmitError(null);
  };
  const waitForNextQuestion = () => {
    setPostSubmitChoice('waiting');
  };
  const finishForNow = () => {
    setPostSubmitChoice('done');
  };

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
  const sessionClosed = context.sessionStatus === 'closed';
  const showEndState = shouldShowSessionEndState(context.sessionStatus, postSubmitChoice);
  const showSurvey = showEndState;

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

      {showEndState ? (
        <SessionEndState
          sessionClosed={sessionClosed}
          submittedCount={submittedCount}
          insights={insights}
        />
      ) : context.sessionStatus !== 'open' ? (
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
        <div className="space-y-5">
          <PromptCard prompt={prompt} />

          {postSubmitChoice === 'waiting' ? (
            <Card className="space-y-2 text-center">
              <p role="status" className="text-sm font-medium text-[var(--color-ink)]">
                Got it — waiting for the next question.
              </p>
              <p className="text-xs text-[var(--color-ink-muted)]">
                This screen will update on its own when your facilitator moves the room on.
              </p>
              <button
                type="button"
                onClick={startAnotherThought}
                className="text-xs font-medium text-[var(--color-accent)] underline"
              >
                Or add another thought now
              </button>
            </Card>
          ) : isReceived(submitPhase) ? (
            <ReceiptCard phase={submitPhase} />
          ) : (
            <>
              {submitError !== null && <ErrorNotice message={submitError} />}
              <AudioRecorder
                onSubmit={(blob, mime, seconds) => void submitRecording(blob, mime, seconds)}
                submitting={submitPhase === 'sending'}
              />
            </>
          )}

          {shouldShowNextActionChoices(submitPhase, postSubmitChoice) && (
            <div className="grid gap-2">
              <button
                type="button"
                onClick={startAnotherThought}
                className="w-full rounded bg-[var(--color-accent)] px-4 py-3 text-sm font-semibold text-[var(--color-accent-contrast)]"
              >
                Add another thought
              </button>
              <button
                type="button"
                onClick={waitForNextQuestion}
                className="w-full rounded border border-[var(--color-line)] px-4 py-3 text-sm font-medium"
              >
                Wait for the next question
              </button>
              <button
                type="button"
                onClick={finishForNow}
                className="w-full rounded border border-[var(--color-line)] px-4 py-3 text-sm font-medium text-[var(--color-ink-muted)]"
              >
                I&rsquo;m done for now
              </button>
            </div>
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

          <EmergingUnderstanding
            insights={insights}
            error={insightsError}
            respondingTo={respondingTo}
            responseError={responseError}
            onRespond={(insightId, type) => void respondToInsight(insightId, type)}
          />
        </div>
      )}

      {showSurvey && (
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
      )}
    </div>
  );
}

/**
 * States the room's current focus plainly, including the "there isn't one
 * right now" case — participants should never have to guess whether a
 * prompt was supposed to load. `promptText: null` (open reflection is
 * permitted) is deliberately distinct copy from `prompt === null` (no
 * current agenda item at all).
 */
function PromptCard({ prompt }: { prompt: ParticipantPromptView | null | undefined }) {
  if (prompt === undefined) {
    return (
      <p role="status" className="text-center text-sm text-[var(--color-ink-muted)]">
        Loading the current question…
      </p>
    );
  }
  if (prompt === null) {
    return (
      <Card className="text-center">
        <p className="text-sm text-[var(--color-ink-muted)]">
          No question is active right now. Your facilitator will start the next round shortly.
        </p>
      </Card>
    );
  }
  return (
    <Card className="space-y-1 border-[var(--color-accent)] bg-[var(--color-accent-soft)]">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-accent)]">
        {prompt.title} · {prompt.position} of {prompt.totalPrompts}
      </p>
      {prompt.promptText !== null ? (
        <p className="text-base font-medium">{prompt.promptText}</p>
      ) : (
        <p className="text-sm text-[var(--color-ink-muted)]">
          Open reflection — share anything relevant right now.
        </p>
      )}
    </Card>
  );
}

/**
 * The backend-confirmed acknowledgement itself — this is what "received"
 * means, shown only once the server (or, for an offline save, this
 * device's own durable queue) has actually accepted the contribution.
 * Never rendered merely because the recorder finished encoding a blob.
 */
function ReceiptCard({ phase }: { phase: 'received' | 'saved_offline' }) {
  return (
    <Card className="space-y-1 text-center">
      <p role="status" className="text-sm font-semibold text-[var(--color-ink)]">
        {phase === 'received' ? 'Received' : 'Saved on your device'}
      </p>
      <p className="text-xs text-[var(--color-ink-muted)]">
        {phase === 'received'
          ? 'Your contribution has reached the facilitator.'
          : "You're offline — this will send automatically once you're back online."}
      </p>
    </Card>
  );
}

/**
 * The governed, provisional read-back — "what we're hearing" — never a
 * canonical or final statement. Only already-confirmed `KnowledgeAssertion`s
 * a facilitator chose to feature reach this list (`session-featured-
 * insights.service.ts`), so there is nothing here for a participant to
 * mistake for something still in flux internally; the badge instead marks
 * how settled the *room's* reading of it is.
 */
function EmergingUnderstanding({
  insights,
  error,
  respondingTo,
  responseError,
  onRespond,
}: {
  insights: FeaturedInsightView[];
  error: string | null;
  respondingTo: string | null;
  responseError: string | null;
  onRespond: (insightId: string, type: ParticipantResponseType) => void;
}) {
  if (error !== null || insights.length === 0) return null;

  return (
    <section aria-labelledby="emerging-understanding-heading" className="space-y-3 pt-2">
      <div>
        <h2
          id="emerging-understanding-heading"
          className="text-sm font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]"
        >
          What we&rsquo;re hearing
        </h2>
        <p className="mt-1 text-xs text-[var(--color-ink-muted)]">
          Provisional — this is the room&rsquo;s emerging understanding, not a final record.
        </p>
      </div>

      {responseError !== null && <ErrorNotice message={responseError} />}

      <div className="space-y-3">
        {insights.map((insight) => (
          <Card key={insight.id} className="space-y-2">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm">{insight.statement}</p>
              <span className="shrink-0 rounded-full border border-[var(--color-line)] px-2 py-0.5 text-[10px] font-medium whitespace-nowrap text-[var(--color-ink-muted)]">
                {BADGE_LABELS[insight.badge]}
              </span>
            </div>

            {insight.myResponseType !== null ? (
              <p className="text-xs text-[var(--color-ink-muted)]">
                You said: {RESPONSE_OPTIONS.find((o) => o.type === insight.myResponseType)?.label}
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {RESPONSE_OPTIONS.map((option) => (
                  <button
                    key={option.type}
                    type="button"
                    disabled={respondingTo === insight.id}
                    onClick={() => onRespond(insight.id, option.type)}
                    className="rounded-full border border-[var(--color-line)] px-3 py-1 text-xs font-medium hover:border-[var(--color-accent)] disabled:opacity-50"
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            )}
          </Card>
        ))}
      </div>
    </section>
  );
}

/**
 * The deliberate close, whether the session itself closed or the
 * participant chose "I'm done for now" — feedback/testimonial solicitation
 * (rendered by the caller, not here) only ever appears alongside this
 * state, never mid-round.
 */
function SessionEndState({
  sessionClosed,
  submittedCount,
  insights,
}: {
  sessionClosed: boolean;
  submittedCount: number;
  insights: FeaturedInsightView[];
}) {
  return (
    <Card className="space-y-4 text-center">
      <div>
        <p className="text-lg font-semibold">Thank you</p>
        <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
          {sessionClosed
            ? 'This session has closed.'
            : 'Thanks for contributing today — come back any time this session is still open.'}
        </p>
      </div>

      <div className="text-left">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">
          What you contributed
        </p>
        <p className="mt-1 text-sm">
          {submittedCount === 0
            ? "You didn't record a contribution this visit."
            : `${submittedCount} contribution${submittedCount === 1 ? '' : 's'} from you.`}
        </p>
      </div>

      {insights.length > 0 && (
        <div className="text-left">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">
            What the room heard
          </p>
          <ul className="mt-1 space-y-1 text-sm">
            {insights.map((insight) => (
              <li key={insight.id}>{insight.statement}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="text-left">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">
          What happens next
        </p>
        <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
          Your facilitator will follow up with the group about how this is used.
        </p>
      </div>
    </Card>
  );
}
