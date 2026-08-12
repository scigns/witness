'use client';

/**
 * Participant consent capture, amendment, withdrawal and history
 * (BUILD_ROADMAP.md Milestone 4, Consent Management).
 *
 * Consent capture is facilitator-mediated, not participant self-service —
 * `captureMethod` records how the facilitator captured what the
 * participant told them (e.g. "in-person verbal"), matching Milestone 3's
 * existing limitation that most participants cannot sign in to Witness at
 * all. This page is therefore always used by a facilitator on the
 * participant's behalf, never by the participant directly.
 *
 * "Capture" (first-time) and "amend" (replace an existing active record)
 * are distinct server operations — this page picks which one to call based
 * on whether `getActive` found a currently-active record, mirroring the
 * session consent configuration page's configure/reconfigure split.
 */

import Link from 'next/link';
import { use, useCallback, useEffect, useState } from 'react';

import type {
  ParticipantConsentRecordDetail,
  SessionConsentConfigurationView,
} from '@witness/contracts';

import { api, ApiError } from '@/lib/api';
import { useSession } from '@/lib/session';
import { Button, Card, ErrorNotice } from '@/components/ui';

const STATUS_LABELS: Record<string, string> = {
  granted: 'Granted',
  partially_granted: 'Partially granted',
  refused: 'Refused',
  withdrawn: 'Withdrawn',
  expired: 'Expired',
  superseded: 'Superseded',
};

/**
 * Plain-language framing for the well-known consent categories
 * (`packages/domain/src/consent-template.ts`'s `CONSENT_CATEGORIES`). A
 * template may also carry organisation-defined categories outside this set —
 * `categoryLabel`/`categoryHelp` fall back to the raw code for those, since
 * this UI cannot know what an organisation-invented category means.
 */
const CATEGORY_LABELS: Record<string, string> = {
  participation: 'Taking part',
  audio_recording: 'Audio recording',
  video_recording: 'Video recording',
  photography: 'Photos',
  transcription: 'Transcription',
  ai_processing: 'Processing with local AI tools',
  attributed_quotation: 'Quoting them by name',
  anonymous_quotation: 'Quoting them anonymously',
  internal_use: 'Use within this organisation',
  external_reporting: 'Sharing in reports outside this organisation',
  publication: 'Publishing publicly',
  research_use: 'Use in research',
  future_reuse: 'Reuse in future programs',
  knowledge_graph_inclusion: "Linking into Witness's institutional record",
  follow_up_contact: 'Being contacted again about this',
};

const CATEGORY_HELP: Record<string, string> = {
  participation: 'They take part in this session at all.',
  audio_recording: 'Their voice is recorded during the session.',
  video_recording: 'They appear on video during the session.',
  photography: 'Photos are taken that may include them.',
  transcription: 'A written transcript is made of what they said.',
  ai_processing:
    'A local AI tool (never sent off this server) summarises or extracts from what they said.',
  attributed_quotation: 'What they said can be quoted with their name attached.',
  anonymous_quotation: 'What they said can be quoted without saying who said it.',
  internal_use: 'Their contribution can be used inside this organisation.',
  external_reporting: 'Their contribution can appear in reports shared outside this organisation.',
  publication: 'Their contribution can be published where the public can see it.',
  research_use: 'Their contribution can be used for research.',
  future_reuse: 'Their contribution can be reused in a later program, not just this one.',
  knowledge_graph_inclusion:
    "Their contribution becomes part of Witness's longer-term institutional memory.",
  follow_up_contact: 'Someone from this program can contact them again later.',
};

function categoryLabel(category: string): string {
  return CATEGORY_LABELS[category] ?? category.replace(/_/g, ' ');
}

export default function ParticipantConsentPage({
  params,
}: {
  params: Promise<{ id: string; sessionId: string; participantId: string }>;
}) {
  const { id: workspaceId, sessionId, participantId } = use(params);
  const { user, ready } = useSession();

  const [configuration, setConfiguration] = useState<SessionConsentConfigurationView | null>(null);
  const [notConfigured, setNotConfigured] = useState(false);
  const [active, setActive] = useState<ParticipantConsentRecordDetail | null>(null);
  const [history, setHistory] = useState<ParticipantConsentRecordDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [busy, setBusy] = useState(false);

  const [decisions, setDecisions] = useState<Record<string, boolean>>({});
  const [captureMethod, setCaptureMethod] = useState('in-person verbal');
  const [withdrawing, setWithdrawing] = useState(false);
  const [withdrawReason, setWithdrawReason] = useState('');

  const load = useCallback(
    async (cancelledRef: { current: boolean }) => {
      try {
        try {
          const configurationResult = await api.getSessionConsentConfiguration(
            workspaceId,
            sessionId,
            user,
          );
          if (cancelledRef.current) return;
          setConfiguration(configurationResult);
          setNotConfigured(false);
        } catch (caught) {
          if (cancelledRef.current) return;
          if (caught instanceof ApiError && caught.code === 'SESSION_CONSENT_NOT_CONFIGURED') {
            setNotConfigured(true);
            setConfiguration(null);
          } else {
            throw caught;
          }
        }

        try {
          const activeResult = await api.getActiveParticipantConsent(
            workspaceId,
            sessionId,
            participantId,
            user,
          );
          if (cancelledRef.current) return;
          setActive(activeResult);
        } catch (caught) {
          if (cancelledRef.current) return;
          if (caught instanceof ApiError && caught.code === 'PARTICIPANT_CONSENT_NOT_FOUND') {
            setActive(null);
          } else {
            throw caught;
          }
        }

        const historyResult = await api.getParticipantConsentHistory(
          workspaceId,
          sessionId,
          participantId,
          user,
        );
        if (cancelledRef.current) return;
        setHistory(historyResult.records);

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
    [workspaceId, sessionId, participantId, user],
  );

  useEffect(() => {
    if (!ready) return;
    const cancelledRef = { current: false };
    void load(cancelledRef);
    return () => {
      cancelledRef.current = true;
    };
  }, [ready, load]);

  useEffect(() => {
    if (configuration === null) return;
    const seed: Record<string, boolean> = {};
    for (const category of [
      ...configuration.requiredCategories,
      ...configuration.optionalCategories,
    ]) {
      seed[category] = true;
    }
    setDecisions(seed);
  }, [configuration]);

  const reload = () => {
    setLoading(true);
    void load({ current: false });
  };

  const submitCapture = async () => {
    if (configuration === null) return;
    setBusy(true);
    setError(null);

    const categoryDecisions = Object.entries(decisions).map(([category, granted]) => ({
      category,
      granted,
    }));
    const body = { categoryDecisions, captureMethod };

    try {
      const result =
        active === null
          ? await api.captureParticipantConsent(workspaceId, sessionId, participantId, body, user)
          : await api.amendParticipantConsent(workspaceId, sessionId, participantId, body, user);
      setActive(result);
      const historyResult = await api.getParticipantConsentHistory(
        workspaceId,
        sessionId,
        participantId,
        user,
      );
      setHistory(historyResult.records);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  const submitWithdraw = async () => {
    if (active === null) return;
    setBusy(true);
    setError(null);

    try {
      await api.withdrawParticipantConsent(
        workspaceId,
        sessionId,
        participantId,
        {
          reason: withdrawReason.trim() === '' ? undefined : withdrawReason,
          expectedVersion: active.version,
        },
        user,
      );
      setActive(null);
      setWithdrawing(false);
      setWithdrawReason('');
      const historyResult = await api.getParticipantConsentHistory(
        workspaceId,
        sessionId,
        participantId,
        user,
      );
      setHistory(historyResult.records);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <p className="text-[var(--color-ink-muted)]">Loading…</p>;
  }

  if (forbidden) {
    return (
      <div className="space-y-4">
        <ErrorNotice message="You do not have permission to view this participant's consent." />
        <Link
          href={`/workspaces/${workspaceId}/sessions/${sessionId}/participants/${participantId}`}
          className="text-sm underline"
        >
          ← Back to participant
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      <Link
        href={`/workspaces/${workspaceId}/sessions/${sessionId}/participants/${participantId}`}
        className="inline-block text-sm underline"
      >
        ← Back to participant
      </Link>

      {error !== null && <ErrorNotice message={error} />}

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          You decide how their contribution can be used.
        </h1>
        <p className="mt-1 text-[var(--color-ink-muted)]">
          Each choice below is independent — granting one doesn&rsquo;t grant the others, and
          nothing here is permanent. Any of these can be changed or withdrawn later, at any time,
          for any reason.
        </p>
      </div>

      {notConfigured ? (
        <Card>
          <p className="text-sm text-[var(--color-ink-muted)]">
            This session has no consent configuration yet.{' '}
            <Link
              href={`/workspaces/${workspaceId}/sessions/${sessionId}/consent-configuration`}
              className="underline"
            >
              Configure consent for this session
            </Link>{' '}
            before capturing a participant's decisions.
          </p>
        </Card>
      ) : (
        configuration !== null && (
          <>
            {active !== null && (
              <Card className="space-y-2 text-sm">
                <p className="font-medium">
                  Current status: {STATUS_LABELS[active.status] ?? active.status}
                </p>
                <p className="text-xs text-[var(--color-ink-muted)]">
                  Captured {new Date(active.capturedAt).toLocaleString()} via {active.captureMethod}
                </p>
                {active.categoryDecisions !== undefined && (
                  <ul className="mt-2 space-y-1">
                    {active.categoryDecisions.map((decision) => (
                      <li key={decision.category} className="flex items-center justify-between">
                        <span>{categoryLabel(decision.category)}</span>
                        <span
                          className={
                            decision.granted
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : 'text-red-700 dark:text-red-400'
                          }
                        >
                          {decision.granted ? 'Granted' : 'Refused'}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            )}

            <Card className="space-y-4">
              <h2 className="text-lg font-semibold">
                {active === null ? 'Capture consent' : 'Amend consent'}
              </h2>
              <div className="space-y-3">
                {[
                  ...configuration.requiredCategories.map((category) => ({
                    category,
                    required: true,
                  })),
                  ...configuration.optionalCategories.map((category) => ({
                    category,
                    required: false,
                  })),
                ].map(({ category, required }) => (
                  <div
                    key={category}
                    className="flex flex-wrap items-start justify-between gap-2 text-sm"
                  >
                    <div className="min-w-0 max-w-sm">
                      <span className="font-medium">{categoryLabel(category)}</span>{' '}
                      <span className="text-xs text-[var(--color-ink-muted)]">
                        ({required ? 'required' : 'optional'})
                      </span>
                      {CATEGORY_HELP[category] !== undefined && (
                        <p className="text-xs text-[var(--color-ink-muted)]">
                          {CATEGORY_HELP[category]}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 gap-3 text-xs">
                      <label className="flex items-center gap-1">
                        <input
                          type="radio"
                          name={`decision-${category}`}
                          checked={decisions[category] === true}
                          onChange={() => setDecisions((d) => ({ ...d, [category]: true }))}
                        />
                        Grant
                      </label>
                      <label className="flex items-center gap-1">
                        <input
                          type="radio"
                          name={`decision-${category}`}
                          checked={decisions[category] === false}
                          onChange={() => setDecisions((d) => ({ ...d, [category]: false }))}
                        />
                        Refuse
                      </label>
                    </div>
                  </div>
                ))}
              </div>

              <div>
                <label htmlFor="captureMethod" className="mb-1 block text-sm font-medium">
                  Capture method <span aria-hidden="true">*</span>
                  <span className="sr-only">(required)</span>
                </label>
                <input
                  id="captureMethod"
                  required
                  maxLength={100}
                  value={captureMethod}
                  onChange={(event) => setCaptureMethod(event.target.value)}
                  placeholder="in-person verbal"
                  className="w-full rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2"
                />
              </div>

              <Button
                variant="primary"
                disabled={busy || captureMethod.trim() === ''}
                onClick={() => void submitCapture()}
              >
                {busy ? 'Saving…' : active === null ? 'Capture consent' : 'Save amendment'}
              </Button>
            </Card>

            {active !== null && (
              <Card className="space-y-3">
                <h2 className="text-lg font-semibold">Withdraw consent</h2>
                {withdrawing ? (
                  <div className="space-y-3">
                    <label htmlFor="withdrawReason" className="mb-1 block text-sm font-medium">
                      Reason (optional)
                    </label>
                    <input
                      id="withdrawReason"
                      value={withdrawReason}
                      onChange={(event) => setWithdrawReason(event.target.value)}
                      className="w-full rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2"
                    />
                    <div className="flex gap-2">
                      <Button
                        variant="danger"
                        disabled={busy}
                        onClick={() => void submitWithdraw()}
                      >
                        Confirm withdrawal
                      </Button>
                      <Button
                        variant="secondary"
                        disabled={busy}
                        onClick={() => setWithdrawing(false)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button variant="danger" disabled={busy} onClick={() => setWithdrawing(true)}>
                    Withdraw consent
                  </Button>
                )}
              </Card>
            )}
          </>
        )
      )}

      <section aria-labelledby="consent-history-heading">
        <h2 id="consent-history-heading" className="mb-3 text-lg font-semibold">
          History
        </h2>
        {history.length === 0 ? (
          <Card>
            <p className="text-sm text-[var(--color-ink-muted)]">No consent history yet.</p>
          </Card>
        ) : (
          <Card>
            <ol className="space-y-2 text-sm">
              {history.map((record) => (
                <li key={record.id} className="flex items-center justify-between">
                  <span>{STATUS_LABELS[record.status] ?? record.status}</span>
                  <span className="text-xs text-[var(--color-ink-muted)]">
                    {new Date(record.capturedAt).toLocaleString()}
                  </span>
                </li>
              ))}
            </ol>
          </Card>
        )}
      </section>

      <button
        type="button"
        onClick={reload}
        className="text-sm underline text-[var(--color-ink-muted)]"
      >
        Reload
      </button>
    </div>
  );
}
