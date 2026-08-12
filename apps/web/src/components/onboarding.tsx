'use client';

/**
 * First-time participant onboarding (Client-Ready Experience overhaul,
 * Phase 10). Deliberately short — five informational screens plus a start
 * button, not a bureaucratic wizard. Shown once per program per browser
 * (localStorage, keyed by workspace id, not synced across devices — good
 * enough for "don't repeatedly force a returning visitor through this,"
 * which is the actual requirement; anything server-tracked would be a new
 * persisted preference this pass doesn't need).
 *
 * Every step stays reachable afterwards from Program Home ("About this
 * program", "People", "My profile", the participant's own Consent screen),
 * so nothing here is the only way to find that information again.
 */

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { Button, Card } from '@/components/ui';

function storageKey(workspaceId: string): string {
  return `witness.onboarding.completed.${workspaceId}`;
}

export function useOnboardingVisible(workspaceId: string): [boolean, () => void] {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      setVisible(window.localStorage.getItem(storageKey(workspaceId)) === null);
    } catch {
      // Storage unavailable (private browsing, disabled) — never block entry over it.
      setVisible(false);
    }
  }, [workspaceId]);

  const dismiss = () => {
    try {
      window.localStorage.setItem(storageKey(workspaceId), '1');
    } catch {
      // Nothing to persist to — the overlay just won't remember next time.
    }
    setVisible(false);
  };

  return [visible, dismiss];
}

interface OnboardingOverlayProps {
  workspaceName: string;
  organisationName: string;
  description: string | null;
  memberCount: number;
  onDismiss: () => void;
}

const STEP_COUNT = 5;

export function OnboardingOverlay({
  workspaceName,
  organisationName,
  description,
  memberCount,
  onDismiss,
}: OnboardingOverlayProps) {
  const [step, setStep] = useState(0);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-heading"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    >
      <Card className="w-full max-w-lg space-y-5">
        <div className="flex items-center justify-between text-xs text-[var(--color-ink-muted)]">
          <span>
            Step {step + 1} of {STEP_COUNT}
          </span>
          <button type="button" onClick={onDismiss} className="underline hover:no-underline">
            Skip
          </button>
        </div>

        {step === 0 && (
          <div className="space-y-2">
            <h2 id="onboarding-heading" className="text-xl font-semibold">
              Welcome to {workspaceName}
            </h2>
            <p className="text-sm text-[var(--color-ink-muted)]">
              Hosted by {organisationName}. This is a co-design program — what you contribute here
              gets recorded, reviewed and traced back to you (or not, depending on what you consent
              to), and used to shape what the group decides.
            </p>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-2">
            <h2 id="onboarding-heading" className="text-xl font-semibold">
              What this is about
            </h2>
            <p className="text-sm">
              {description ??
                'A description hasn’t been added for this program yet — check with a facilitator if you’re unsure what it covers.'}
            </p>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-2">
            <h2 id="onboarding-heading" className="text-xl font-semibold">
              Who&rsquo;s here
            </h2>
            <p className="text-sm text-[var(--color-ink-muted)]">
              {memberCount} {memberCount === 1 ? 'person is' : 'people are'} taking part in this
              program, including its facilitators. You can browse everyone&rsquo;s profile from the
              People page at any time.
            </p>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-2">
            <h2 id="onboarding-heading" className="text-xl font-semibold">
              Your choices
            </h2>
            <p className="text-sm text-[var(--color-ink-muted)]">
              You decide how your contribution can be used — whether it&rsquo;s attributed to you by
              name, kept anonymous, recorded, or included in reports. You&rsquo;ll be asked to
              confirm this before you contribute, and you can change your mind later.
            </p>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-2">
            <h2 id="onboarding-heading" className="text-xl font-semibold">
              You&rsquo;re ready
            </h2>
            <p className="text-sm text-[var(--color-ink-muted)]">
              You can complete your profile any time from &ldquo;Signed in as&rdquo; in the top
              navigation — it&rsquo;s optional, and it&rsquo;s how other participants get to know
              you.
            </p>
            <Link href="/profile" className="text-sm underline hover:no-underline">
              Complete your profile now →
            </Link>
          </div>
        )}

        <div className="flex justify-between">
          <Button
            variant="secondary"
            disabled={step === 0}
            onClick={() => setStep((s) => Math.max(0, s - 1))}
          >
            Back
          </Button>
          {step < STEP_COUNT - 1 ? (
            <Button variant="primary" onClick={() => setStep((s) => s + 1)}>
              Next
            </Button>
          ) : (
            <Button variant="primary" onClick={onDismiss}>
              Start
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}
