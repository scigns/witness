'use client';

/**
 * A short, dismissible, non-blocking feedback prompt shown at a natural
 * completion moment (Phase 6, Track B) — never during the work itself, and
 * never covering the primary action the person just completed. Transport-
 * agnostic: the four wiring points (participant capture, facilitator recap,
 * reviewer queue, report export) each pass in a `submitFeedback` closure
 * bound to either the authenticated `api.ts` calls or the capture-token
 * ones, so this component knows nothing about which.
 *
 * Positive feedback (`offerTestimonial: true` in the server's response)
 * reveals a nested `TestimonialPrompt` — the follow-up "would you share
 * this?" step. Declining, giving negative feedback, or dismissing the
 * survey outright all suppress it (per `productArea`) for 14 days, so it
 * never nags on the next page load.
 */

import { useEffect, useId, useState } from 'react';

import type { ProductArea, SubmitTestimonialConsentRequest } from '@witness/contracts';

import { ApiError } from '../lib/api';
import { isSuppressed, suppress } from '../lib/survey-suppression';
import { Button, Card, ErrorNotice } from './ui';

const RATING_LABELS: Readonly<Record<number, string>> = {
  1: '1 — not at all',
  2: '2',
  3: '3',
  4: '4',
  5: '5 — extremely',
};

export interface MicroSurveyProps {
  productArea: ProductArea;
  question: string;
  submitFeedback: (
    rating: number,
    comment: string | null,
  ) => Promise<{ feedbackId: string; offerTestimonial: boolean }>;
  /** Omitted where the flow has no meaningful testimonial follow-up. */
  submitTestimonialConsent?: (
    feedbackId: string,
    request: SubmitTestimonialConsentRequest,
  ) => Promise<void>;
}

type Stage = 'checking' | 'rating' | 'testimonial' | 'done' | 'dismissed';

export function MicroSurvey({
  productArea,
  question,
  submitFeedback,
  submitTestimonialConsent,
}: MicroSurveyProps) {
  const [stage, setStage] = useState<Stage>('checking');
  const [rating, setRating] = useState<number | null>(null);
  const [comment, setComment] = useState('');
  const [feedbackId, setFeedbackId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const groupLabelId = useId();

  // Checked only after mount — localStorage is unavailable during SSR, and
  // deciding this in an effect avoids a hydration mismatch rather than
  // guessing server-side.
  useEffect(() => {
    setStage(isSuppressed(productArea, Date.now(), window.localStorage) ? 'dismissed' : 'rating');
  }, [productArea]);

  if (stage === 'checking' || stage === 'dismissed' || stage === 'done') return null;

  function dismiss() {
    suppress(productArea, Date.now(), window.localStorage);
    setStage('dismissed');
  }

  async function onSubmitRating() {
    if (rating === null) return;
    setBusy(true);
    setError(null);
    try {
      const result = await submitFeedback(rating, comment.trim() === '' ? null : comment.trim());
      setFeedbackId(result.feedbackId);
      // Suppress on completion too, not only on dismiss — answering once is
      // enough; it should not reappear on the next page load either.
      suppress(productArea, Date.now(), window.localStorage);
      setStage(
        result.offerTestimonial && submitTestimonialConsent !== undefined ? 'testimonial' : 'done',
      );
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.message : 'Something went wrong. Please try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div role="region" aria-label="Quick feedback">
      <Card className="space-y-3">
        {stage === 'rating' && (
          <>
            <p id={groupLabelId} className="font-medium">
              {question}
            </p>
            <div role="radiogroup" aria-labelledby={groupLabelId} className="flex flex-wrap gap-2">
              {[1, 2, 3, 4, 5].map((value) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={rating === value}
                  onClick={() => setRating(value)}
                  className={`rounded border px-3 py-1.5 text-sm font-medium transition-colors ${
                    rating === value
                      ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)]'
                      : 'border-[var(--color-line)] bg-[var(--color-paper)] hover:bg-[var(--color-accent-soft)]'
                  }`}
                >
                  {RATING_LABELS[value]}
                </button>
              ))}
            </div>
            <label className="block text-sm text-[var(--color-ink-muted)]">
              Anything you'd like to add? (optional)
              <textarea
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                maxLength={2000}
                rows={2}
                className="mt-1 w-full rounded border border-[var(--color-line)] bg-[var(--color-paper)] p-2 text-sm text-[var(--color-ink)]"
              />
            </label>
            {error !== null && <ErrorNotice message={error} />}
            <div className="flex gap-2">
              <Button variant="primary" disabled={rating === null || busy} onClick={onSubmitRating}>
                Submit
              </Button>
              <Button
                variant="secondary"
                disabled={busy}
                aria-label="Dismiss feedback prompt"
                onClick={dismiss}
              >
                Not now
              </Button>
            </div>
          </>
        )}
        {stage === 'testimonial' &&
          feedbackId !== null &&
          submitTestimonialConsent !== undefined && (
            <TestimonialPrompt
              onChoose={async (request) => {
                setBusy(true);
                setError(null);
                try {
                  await submitTestimonialConsent(feedbackId, request);
                  setStage('done');
                } catch (caught) {
                  setError(
                    caught instanceof ApiError
                      ? caught.message
                      : 'Something went wrong. Please try again.',
                  );
                  setBusy(false);
                }
              }}
              busy={busy}
              error={error}
            />
          )}
      </Card>
    </div>
  );
}

function TestimonialPrompt({
  onChoose,
  busy,
  error,
}: {
  onChoose: (request: SubmitTestimonialConsentRequest) => void;
  busy: boolean;
  error: string | null;
}) {
  const [showNamedForm, setShowNamedForm] = useState(false);
  const [attributedName, setAttributedName] = useState('');
  const [organisationAttributionConsent, setOrganisationAttributionConsent] = useState(false);

  return (
    <div className="space-y-3 border-t border-[var(--color-line)] pt-3">
      <p className="font-medium">
        Thank you. Would you be willing to share your experience to help others understand Witness?
      </p>
      {!showNamedForm ? (
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => onChoose({ consentChoice: 'declined' })}
          >
            No thanks
          </Button>
          <Button variant="secondary" disabled={busy} onClick={() => setShowNamedForm(true)}>
            Yes, with my name
          </Button>
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() => onChoose({ consentChoice: 'anonymous', organisationAttributionConsent })}
          >
            Yes, anonymously
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          <label className="block text-sm text-[var(--color-ink-muted)]">
            Name to attribute this to
            <input
              type="text"
              value={attributedName}
              onChange={(event) => setAttributedName(event.target.value)}
              maxLength={200}
              className="mt-1 w-full rounded border border-[var(--color-line)] bg-[var(--color-paper)] p-2 text-sm text-[var(--color-ink)]"
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-[var(--color-ink-muted)]">
            <input
              type="checkbox"
              checked={organisationAttributionConsent}
              onChange={(event) => setOrganisationAttributionConsent(event.target.checked)}
            />
            You may also name my organisation
          </label>
          <div className="flex gap-2">
            <Button
              variant="primary"
              disabled={busy}
              onClick={() =>
                onChoose({
                  consentChoice: 'named',
                  attributedName: attributedName.trim() === '' ? null : attributedName.trim(),
                  organisationAttributionConsent,
                })
              }
            >
              Confirm
            </Button>
            <Button variant="secondary" disabled={busy} onClick={() => setShowNamedForm(false)}>
              Back
            </Button>
          </div>
        </div>
      )}
      {error !== null && <ErrorNotice message={error} />}
    </div>
  );
}
