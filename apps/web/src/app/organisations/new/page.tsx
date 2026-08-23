'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import { api, ApiError } from '@/lib/api';
import { useSession } from '@/lib/session';
import { Button, Card, ErrorNotice } from '@/components/ui';
import {
  INSTITUTIONAL_PROFILE_INFO,
  INSTITUTIONAL_PROFILE_ORDER,
  type InstitutionalProfile,
} from '@/lib/institutional-profiles';

export default function NewOrganisationPage() {
  const router = useRouter();
  const { user } = useSession();

  const [name, setName] = useState('');
  const [administratorEmail, setAdministratorEmail] = useState('');
  const [administratorName, setAdministratorName] = useState('');
  const [profile, setProfile] = useState<InstitutionalProfile>('general');
  const [storageQuotaGb, setStorageQuotaGb] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      await api.createOrganisation(
        {
          name,
          administratorEmail,
          administratorName,
          profile,
          storageQuotaGb: storageQuotaGb.trim() === '' ? undefined : Number(storageQuotaGb),
        },
        user,
      );
      router.push('/organisations');
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Something went wrong.');
      setBusy(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Create an organisation</h1>
        <p className="mt-1 text-[var(--color-ink-muted)]">
          Onboards a new institution with its own administrator, who activates by signing in with
          the email below. This requires a platform-operator session — the operator who deployed
          this instance, not an administrator of any one organisation.
        </p>
      </div>

      {error !== null && <ErrorNotice message={error} />}

      <form onSubmit={(event) => void submit(event)} className="space-y-5">
        <Card className="space-y-4">
          <div>
            <label htmlFor="name" className="mb-1 block text-sm font-medium">
              Organisation name <span aria-hidden="true">*</span>
              <span className="sr-only">(required)</span>
            </label>
            <input
              id="name"
              required
              maxLength={200}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Eastern Settlements Water Committee"
              className="w-full rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2"
            />
          </div>

          <div>
            <label htmlFor="administratorName" className="mb-1 block text-sm font-medium">
              Administrator name <span aria-hidden="true">*</span>
              <span className="sr-only">(required)</span>
            </label>
            <input
              id="administratorName"
              required
              maxLength={200}
              value={administratorName}
              onChange={(event) => setAdministratorName(event.target.value)}
              placeholder="Jane Cakobau"
              className="w-full rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2"
            />
          </div>

          <div>
            <label htmlFor="administratorEmail" className="mb-1 block text-sm font-medium">
              Administrator email <span aria-hidden="true">*</span>
              <span className="sr-only">(required)</span>
            </label>
            <input
              id="administratorEmail"
              type="email"
              required
              value={administratorEmail}
              onChange={(event) => setAdministratorEmail(event.target.value)}
              placeholder="jane@example.org"
              className="w-full rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2"
            />
            <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
              They become the organisation&apos;s administrator by signing in through the identity
              provider with this exact, verified email address — this invites them, it does not
              create a login on their behalf.
            </p>
          </div>

          <div>
            <label htmlFor="profile" className="mb-1 block text-sm font-medium">
              Institutional profile
            </label>
            <select
              id="profile"
              value={profile}
              onChange={(event) => setProfile(event.target.value as InstitutionalProfile)}
              className="w-full rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2"
            >
              {INSTITUTIONAL_PROFILE_ORDER.map((value) => (
                <option key={value} value={value}>
                  {INSTITUTIONAL_PROFILE_INFO[value].label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
              {INSTITUTIONAL_PROFILE_INFO[profile].description} Configures a starting consent
              template only — never a separate deployment. Facilitators can edit or replace it
              afterwards.
            </p>
          </div>

          <div>
            <label htmlFor="storageQuotaGb" className="mb-1 block text-sm font-medium">
              Storage quota (GB)
            </label>
            <input
              id="storageQuotaGb"
              type="number"
              min={1}
              value={storageQuotaGb}
              onChange={(event) => setStorageQuotaGb(event.target.value)}
              placeholder="5 (default)"
              className="w-full rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2"
            />
            <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
              Leave blank for the 5 GB default. Changeable later from the organisation page.
            </p>
          </div>
        </Card>

        <div className="flex gap-2">
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? 'Creating…' : 'Create organisation'}
          </Button>
        </div>
      </form>
    </div>
  );
}
