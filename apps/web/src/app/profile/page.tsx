'use client';

/**
 * My profile — a person editing their own "what I bring to this
 * conversation" (Client-Ready Experience overhaul, Phase 5). Deliberately
 * narrow: only `bio` is editable here. Name and email stay
 * administrator-managed identity fields (Milestone 1.1); this page never
 * offers to change them, so it cannot imply it can.
 */

import { useEffect, useState } from 'react';

import { ApiError, authApi } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Avatar, Button, Card, ErrorNotice } from '@/components/ui';

const STORAGE_KEY = 'witness.auth.sessionToken';

export default function ProfilePage() {
  const { status, currentUser } = useAuth();

  const [bio, setBio] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setBio(currentUser?.bio ?? '');
  }, [currentUser]);

  if (status === 'loading') {
    return <p className="text-[var(--color-ink-muted)]">Loading…</p>;
  }

  if (status !== 'authenticated' || currentUser === null) {
    return <ErrorNotice message="Sign in to see your profile." />;
  }

  const save = async () => {
    const token = sessionStorage.getItem(STORAGE_KEY);
    if (token === null) {
      setError('Your session has expired. Sign in again.');
      return;
    }

    setSaving(true);
    setSaved(false);
    try {
      await authApi.updateProfile(token, { bio: bio.trim() === '' ? null : bio.trim() });
      setSaved(true);
      setError(null);
      // `useAuth`'s CurrentUserView is only refetched on mount — reload so
      // the bio shown everywhere else (People directory, this page on a
      // future visit) reflects what was just saved, not a stale copy.
      setTimeout(() => window.location.reload(), 600);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Something went wrong.');
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">My profile</h1>
        <p className="mt-1 text-[var(--color-ink-muted)]">
          What people across your programs see about you.
        </p>
      </div>

      {error !== null && <ErrorNotice message={error} />}

      <Card className="space-y-4">
        <div className="flex items-center gap-4">
          <Avatar name={currentUser.displayName} size="lg" />
          <div>
            <p className="text-lg font-medium">{currentUser.displayName}</p>
            <p className="text-sm text-[var(--color-ink-muted)]">{currentUser.email}</p>
          </div>
        </div>

        <div>
          <label htmlFor="bio" className="mb-1 block text-sm font-medium">
            What you bring to these conversations
          </label>
          <p className="mb-2 text-xs text-[var(--color-ink-muted)]">
            Shown on your profile in every program you take part in. You decide what to share here —
            leave it blank if you&rsquo;d rather not.
          </p>
          <textarea
            id="bio"
            rows={4}
            maxLength={1000}
            value={bio}
            onChange={(event) => setBio(event.target.value)}
            placeholder="Your background, what you care about, what perspective you bring…"
            className="w-full rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2"
          />
        </div>

        <div className="flex items-center gap-3">
          <Button variant="primary" disabled={saving} onClick={() => void save()}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
          {saved && <span className="text-sm text-emerald-700 dark:text-emerald-400">Saved.</span>}
        </div>
      </Card>
    </div>
  );
}
