import { useCallback, useEffect, useRef, useState } from 'react';

import {
  ApiError,
  isNetworkFailure,
  isReceived,
  listForParticipantSession,
  newClientRequestId,
  remove as removeQueued,
  shouldReturnToPromptAfterWaiting,
  shouldShowNextActionChoices,
  shouldShowSessionEndState,
  updateStatus as updateQueuedStatus,
  enqueue,
  type CaptureSession,
  type ParticipantApiClient,
  type PostSubmitChoice,
  type QueuedParticipantContribution,
  type SubmitPhase,
} from '@witness/participant-client';
import type {
  FeaturedInsightView,
  ParticipantCaptureContextView,
  ParticipantPromptView,
  ParticipantResponseType,
} from '@witness/contracts';

import { AudioRecorder } from '../components/audio-recorder.js';
import { Card, ErrorNotice, Loading } from '../components/ui.js';

const LIVE_STATE_POLL_MS = 20_000;

const RESPONSE_OPTIONS: { type: ParticipantResponseType; label: string }[] = [
  { type: 'reflects', label: 'This reflects what I heard' },
  { type: 'needs_nuance', label: 'Needs more nuance' },
  { type: 'missing_context', label: 'Something is missing' },
  { type: 'sees_differently', label: 'I see this differently' },
];

function quotationCategoryFor(identityMode: ParticipantCaptureContextView['identityMode']): string {
  return identityMode === 'named' ? 'attributed_quotation' : 'anonymous_quotation';
}

function consentCategoriesFor(context: ParticipantCaptureContextView): string[] {
  const quotation = quotationCategoryFor(context.identityMode);
  return context.requiredConsentCategories.includes(quotation)
    ? context.requiredConsentCategories
    : [...context.requiredConsentCategories, quotation];
}

function categoryLabel(category: string): string {
  return category
    .split('_')
    .map((word) => word[0]?.toUpperCase() + word.slice(1))
    .join(' ');
}

function extensionFor(mimeType: string): string {
  return mimeType.split(';')[0]?.split('/')[1] ?? 'webm';
}

/**
 * The mobile equivalent of `apps/web`'s `/capture/[sessionId]` page —
 * consent, current prompt, text-or-audio contribution, offline queue, and
 * the emerging-understanding response panel, all against the same
 * `@witness/participant-client`. `onTokenInvalid` lets the parent clear the
 * stored session and return to `NO_SESSION` once the backend authoritatively
 * says the capture token is dead (never inferred merely from a 401 that
 * could equally be a stale in-flight request).
 */
export function CaptureScreen({
  session,
  participantClient,
  onTokenInvalid,
}: {
  session: CaptureSession;
  participantClient: ParticipantApiClient;
  onTokenInvalid: () => void;
}) {
  const [context, setContext] = useState<ParticipantCaptureContextView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [consentSelections, setConsentSelections] = useState<Record<string, boolean>>({});
  const [consentBusy, setConsentBusy] = useState(false);
  const [consentError, setConsentError] = useState<string | null>(null);
  const [consentGranted, setConsentGranted] = useState(false);

  const [mode, setMode] = useState<'text' | 'audio'>('text');
  const [textContribution, setTextContribution] = useState('');

  const [prompt, setPrompt] = useState<ParticipantPromptView | null | undefined>(undefined);
  const [insights, setInsights] = useState<FeaturedInsightView[]>([]);
  const [respondingTo, setRespondingTo] = useState<string | null>(null);

  const [submitPhase, setSubmitPhase] = useState<SubmitPhase>('idle');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [postSubmitChoice, setPostSubmitChoice] = useState<PostSubmitChoice>(null);
  const [submittedCount, setSubmittedCount] = useState(0);
  const [queued, setQueued] = useState<QueuedParticipantContribution[]>([]);

  const promptIdRef = useRef<string | null>(null);

  const loadContext = useCallback(async () => {
    try {
      const result = await participantClient.getParticipantCaptureContext(session.captureToken);
      setContext(result);
      setLoadError(null);
    } catch (caught) {
      if (caught instanceof ApiError && (caught.status === 401 || caught.status === 403)) {
        onTokenInvalid();
        return;
      }
      setLoadError(caught instanceof ApiError ? caught.message : 'Something went wrong.');
    }
  }, [session.captureToken, participantClient, onTokenInvalid]);

  useEffect(() => {
    void loadContext();
  }, [loadContext]);

  const loadLiveState = useCallback(async () => {
    try {
      const nextPrompt = await participantClient.getParticipantPrompt(session.captureToken);
      setPrompt(nextPrompt);
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
      // Companion panel only — never gates the primary capture flow.
    }
    try {
      setInsights(await participantClient.getParticipantInsights(session.captureToken));
    } catch {
      // Same as above.
    }
  }, [session.captureToken, participantClient, postSubmitChoice]);

  useEffect(() => {
    void loadLiveState();
    const interval = window.setInterval(() => void loadLiveState(), LIVE_STATE_POLL_MS);
    return () => window.clearInterval(interval);
  }, [loadLiveState]);

  const refreshQueued = useCallback(async () => {
    setQueued(await listForParticipantSession(session.sessionId));
  }, [session.sessionId]);

  const flushQueue = useCallback(async () => {
    const pending = (await listForParticipantSession(session.sessionId)).filter(
      (item) => item.status === 'pending' || item.status === 'failed',
    );
    for (const item of pending) {
      await updateQueuedStatus(item.id, 'syncing');
      try {
        const result = await participantClient.captureParticipantEvidence(
          item.captureToken,
          item.body,
        );
        if (item.attachment !== null) {
          await participantClient.uploadParticipantCaptureAttachment(
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
  }, [session.sessionId, participantClient, refreshQueued]);

  useEffect(() => {
    void refreshQueued();
    void flushQueue();
    const onOnline = () => void flushQueue();
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [refreshQueued, flushQueue]);

  const submitConsent = async () => {
    if (context === null) return;
    setConsentBusy(true);
    setConsentError(null);
    try {
      await participantClient.captureParticipantSelfConsent(session.captureToken, {
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

  const submitEvidence = async (
    body: {
      evidenceType: string;
      title: string;
      content: string;
      clientRequestId: string;
      sourceAgendaItemId?: string;
      sessionOffsetSeconds?: number;
    },
    attachment: { blob: Blob; filename: string } | null,
  ) => {
    setSubmitPhase('sending');
    setSubmitError(null);
    try {
      const result = await participantClient.captureParticipantEvidence(session.captureToken, body);
      if (attachment !== null) {
        await participantClient.uploadParticipantCaptureAttachment(
          session.captureToken,
          result.evidenceId,
          attachment.blob,
          attachment.filename,
        );
      }
      setSubmittedCount((count) => count + 1);
      setSubmitPhase('received');
    } catch (caught) {
      if (isNetworkFailure(caught)) {
        try {
          await enqueue({
            kind: 'participant',
            id: body.clientRequestId,
            sessionId: session.sessionId,
            captureToken: session.captureToken,
            body,
            attachment,
            status: 'pending',
            createdAt: Date.now(),
            lastError: null,
          });
          await refreshQueued();
          setSubmitPhase('saved_offline');
        } catch {
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

  const submitText = () => {
    const content = textContribution.trim();
    if (content === '') return;
    const clientRequestId = newClientRequestId();
    void submitEvidence(
      {
        evidenceType: 'observation',
        title: `Contribution — ${new Date().toLocaleString()}`,
        content,
        clientRequestId,
        ...(prompt?.id !== undefined ? { sourceAgendaItemId: prompt.id } : {}),
      },
      null,
    ).then(() => setTextContribution(''));
  };

  const submitRecording = (blob: Blob, mimeType: string, durationSeconds: number) => {
    const clientRequestId = newClientRequestId();
    const filename = `contribution-${new Date().toISOString()}.${extensionFor(mimeType)}`;
    void submitEvidence(
      {
        evidenceType: 'audio_note',
        title: `Contribution — ${new Date().toLocaleString()}`,
        content: 'Audio contribution recorded via Witness Participate.',
        sessionOffsetSeconds: durationSeconds,
        clientRequestId,
        ...(prompt?.id !== undefined ? { sourceAgendaItemId: prompt.id } : {}),
      },
      { blob, filename },
    );
  };

  const respondToInsight = async (insightId: string, responseType: ParticipantResponseType) => {
    setRespondingTo(insightId);
    try {
      await participantClient.submitParticipantInsightResponse(session.captureToken, insightId, {
        responseType,
      });
      await loadLiveState();
    } catch {
      // Non-fatal — the response panel is a companion, not a gate.
    } finally {
      setRespondingTo(null);
    }
  };

  const startAnotherThought = () => {
    setSubmitPhase('idle');
    setPostSubmitChoice(null);
    setSubmitError(null);
  };

  if (loadError !== null) {
    return (
      <div className="screen">
        <ErrorNotice message={loadError} />
      </div>
    );
  }

  if (context === null) {
    return (
      <div className="screen">
        <Loading />
      </div>
    );
  }

  const hasConsentSetup = context.requiredConsentCategories.length > 0;
  const needsConsent =
    hasConsentSetup && context.consentStatusSummary !== 'granted' && !consentGranted;
  const showEndState = shouldShowSessionEndState(context.sessionStatus, postSubmitChoice);

  return (
    <div className="screen">
      <div className="center">
        <h1 style={{ fontSize: '1.25rem', fontWeight: 600, margin: 0 }}>{context.sessionTitle}</h1>
        <p className="muted">Facilitated by {context.facilitatorDisplayName}</p>
        <p className="muted" style={{ fontSize: '0.75rem' }}>
          Contributing as <strong>{context.displayName}</strong>
        </p>
      </div>

      {showEndState ? (
        <Card>
          <p style={{ fontWeight: 600 }}>Thank you</p>
          <p className="muted">
            {context.sessionStatus === 'closed'
              ? 'This session has closed.'
              : 'Thanks for contributing today.'}
          </p>
          <p className="muted">
            {submittedCount === 0
              ? "You didn't record a contribution this visit."
              : `${submittedCount} contribution${submittedCount === 1 ? '' : 's'} from you.`}
          </p>
        </Card>
      ) : context.sessionStatus !== 'open' ? (
        <ErrorNotice message="This session is not currently open. Contributions cannot be recorded right now." />
      ) : !hasConsentSetup ? (
        <ErrorNotice message="This session hasn't been set up for self-capture yet. Ask your facilitator." />
      ) : needsConsent ? (
        <Card>
          <p>Before you contribute, please tell us what you&rsquo;re comfortable with:</p>
          {consentError !== null && <ErrorNotice message={consentError} />}
          {consentCategoriesFor(context).map((category) => (
            <label
              key={category}
              style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}
            >
              <input
                type="checkbox"
                checked={consentSelections[category] === true}
                onChange={(event) =>
                  setConsentSelections((prev) => ({ ...prev, [category]: event.target.checked }))
                }
              />
              <span>I agree to {categoryLabel(category).toLowerCase()}</span>
            </label>
          ))}
          <button
            type="button"
            onClick={() => void submitConsent()}
            disabled={consentBusy}
            className="button-primary"
          >
            {consentBusy ? 'Saving…' : 'Continue'}
          </button>
        </Card>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <Card>
            <p className="muted" style={{ fontSize: '0.75rem', textTransform: 'uppercase' }}>
              {prompt === undefined
                ? 'Loading the current question…'
                : prompt === null
                  ? 'No question active'
                  : `${prompt.title} · ${prompt.position} of ${prompt.totalPrompts}`}
            </p>
            {prompt !== undefined && prompt !== null && (
              <p style={{ fontWeight: 500 }}>
                {prompt.promptText ?? 'Open reflection — share anything relevant right now.'}
              </p>
            )}
          </Card>

          {postSubmitChoice === 'waiting' ? (
            <Card>
              <p role="status" style={{ fontWeight: 600 }} className="center">
                Got it — waiting for the next question.
              </p>
              <button type="button" onClick={startAnotherThought} className="button-secondary">
                Or add another thought now
              </button>
            </Card>
          ) : isReceived(submitPhase) ? (
            <Card>
              <p role="status" style={{ fontWeight: 600 }} className="center">
                {submitPhase === 'received' ? 'Received' : 'Saved on your device'}
              </p>
              <p className="muted center">
                {submitPhase === 'received'
                  ? 'Your contribution has reached the facilitator.'
                  : "You're offline — this will send automatically once you're back online."}
              </p>
            </Card>
          ) : (
            <>
              {submitError !== null && <ErrorNotice message={submitError} />}

              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => setMode('text')}
                  className={mode === 'text' ? 'button-primary' : 'button-secondary'}
                  style={{ flex: 1 }}
                >
                  Write
                </button>
                <button
                  type="button"
                  onClick={() => setMode('audio')}
                  className={mode === 'audio' ? 'button-primary' : 'button-secondary'}
                  style={{ flex: 1 }}
                >
                  Record
                </button>
              </div>

              {mode === 'text' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <textarea
                    rows={5}
                    value={textContribution}
                    onChange={(event) => setTextContribution(event.target.value)}
                    placeholder="Share your thought…"
                    maxLength={5000}
                  />
                  <button
                    type="button"
                    onClick={submitText}
                    disabled={submitPhase === 'sending' || textContribution.trim() === ''}
                    className="button-primary"
                  >
                    {submitPhase === 'sending' ? 'Submitting…' : 'Submit'}
                  </button>
                </div>
              ) : (
                <AudioRecorder onSubmit={submitRecording} submitting={submitPhase === 'sending'} />
              )}
            </>
          )}

          {shouldShowNextActionChoices(submitPhase, postSubmitChoice) && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <button type="button" onClick={startAnotherThought} className="button-primary">
                Add another thought
              </button>
              <button
                type="button"
                onClick={() => setPostSubmitChoice('waiting')}
                className="button-secondary"
              >
                Wait for the next question
              </button>
              <button
                type="button"
                onClick={() => setPostSubmitChoice('done')}
                className="button-secondary"
              >
                I&rsquo;m done for now
              </button>
            </div>
          )}

          {queued.length > 0 && (
            <p role="status" className="center muted">
              {queued.length} waiting to send once you&rsquo;re back online.{' '}
              <button
                type="button"
                onClick={() => void flushQueue()}
                style={{
                  background: 'none',
                  border: 'none',
                  textDecoration: 'underline',
                  color: 'var(--color-accent)',
                  padding: 0,
                }}
              >
                Retry now
              </button>
            </p>
          )}

          {insights.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <p className="muted" style={{ fontSize: '0.75rem', textTransform: 'uppercase' }}>
                What we&rsquo;re hearing
              </p>
              {insights.map((insight) => (
                <Card key={insight.id}>
                  <p style={{ fontSize: '0.875rem' }}>{insight.statement}</p>
                  {insight.myResponseType === null && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem' }}>
                      {RESPONSE_OPTIONS.map((option) => (
                        <button
                          key={option.type}
                          type="button"
                          disabled={respondingTo === insight.id}
                          onClick={() => void respondToInsight(insight.id, option.type)}
                          className="button-secondary"
                          style={{
                            width: 'auto',
                            padding: '0.375rem 0.75rem',
                            fontSize: '0.75rem',
                          }}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  )}
                </Card>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
