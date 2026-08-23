'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';

import type { OrganisationSummary } from '@witness/contracts';

import { api, ApiError } from '@/lib/api';
import { useSession } from '@/lib/session';
import { Button, Card, ErrorNotice } from '@/components/ui';
import {
  INSTITUTIONAL_PROFILE_INFO,
  type InstitutionalProfile,
} from '@/lib/institutional-profiles';

export default function NewWorkspacePage() {
  const router = useRouter();
  const { user, ready } = useSession();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [organisationId, setOrganisationId] = useState('');
  const [organisations, setOrganisations] = useState<OrganisationSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadingOrganisations, setLoadingOrganisations] = useState(true);

  const selectedOrganisation = organisations.find(
    (organisation) => organisation.id === organisationId,
  );
  const profileInfo =
    INSTITUTIONAL_PROFILE_INFO[
      (selectedOrganisation?.profile as InstitutionalProfile) ?? 'general'
    ];

  useEffect(() => {
    if (!ready) return;

    let cancelled = false;

    void (async () => {
      setLoadingOrganisations(true);
      try {
        const result = await api.listOrganisations(user);
        if (cancelled) return;
        setOrganisations(result.organisations);
        setOrganisationId((current) => current || (result.organisations[0]?.id ?? ''));
      } catch (caught) {
        if (cancelled) return;
        setError(caught instanceof ApiError ? caught.message : 'Something went wrong.');
      } finally {
        if (!cancelled) setLoadingOrganisations(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [ready, user]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      await api.createWorkspace(
        {
          name,
          organisationId,
          description: description.trim() === '' ? undefined : description.trim(),
        },
        user,
      );
      router.push('/workspaces');
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Something went wrong.');
      setBusy(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Create a program</h1>
        <p className="mt-1 text-[var(--color-ink-muted)]">
          Least privilege means this requires the <code className="font-mono">admin</code> role —
          switch to it above if the request is refused.
        </p>
      </div>

      {error !== null && <ErrorNotice message={error} />}

      {!loadingOrganisations && organisations.length === 0 ? (
        <Card>
          <p className="font-medium">No organisations exist yet.</p>
          <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
            A program cannot exist without an organisation — create one first.
          </p>
        </Card>
      ) : (
        <form onSubmit={(event) => void submit(event)} className="space-y-5">
          <Card className="space-y-4">
            <div>
              <label htmlFor="organisationId" className="mb-1 block text-sm font-medium">
                Organisation <span aria-hidden="true">*</span>
                <span className="sr-only">(required)</span>
              </label>
              <select
                id="organisationId"
                required
                disabled={loadingOrganisations}
                value={organisationId}
                onChange={(event) => setOrganisationId(event.target.value)}
                className="w-full rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2"
              >
                {loadingOrganisations && <option value="">Loading…</option>}
                {organisations.map((organisation) => (
                  <option key={organisation.id} value={organisation.id}>
                    {organisation.name}
                  </option>
                ))}
              </select>
              {profileInfo.programGuidance !== null && (
                <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
                  {selectedOrganisation?.name} uses the {profileInfo.label} profile.{' '}
                  {profileInfo.programGuidance}
                </p>
              )}
            </div>

            <div>
              <label htmlFor="name" className="mb-1 block text-sm font-medium">
                Name <span aria-hidden="true">*</span>
                <span className="sr-only">(required)</span>
              </label>
              <input
                id="name"
                required
                maxLength={200}
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={profileInfo.programNamePlaceholder}
                className="w-full rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2"
              />
            </div>

            <div>
              <label htmlFor="description" className="mb-1 block text-sm font-medium">
                Description
              </label>
              <textarea
                id="description"
                rows={3}
                maxLength={4000}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Optional — what is this program for?"
                className="w-full rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2"
              />
            </div>
          </Card>

          <div className="flex gap-2">
            <Button type="submit" variant="primary" disabled={busy || organisationId === ''}>
              {busy ? 'Creating…' : 'Create program'}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
