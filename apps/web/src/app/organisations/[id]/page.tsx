'use client';

/**
 * Organisation dashboard — Overview.
 *
 * Storage/usage stay here (operator-facing numbers someone checks first);
 * membership management lives at `/people`, invitations at `/invitations`,
 * and programmes at `/programmes` — see `OrganisationNav`. Split out of a
 * single 645-line page that mixed all four concerns together.
 */

import Link from 'next/link';
import { use, useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';

import type {
  OrganisationInvitationView,
  OrganisationStorageUsage,
  OrganisationSummary,
  OrganisationUsage,
  WorkspaceSummary,
} from '@witness/contracts';

import { api, ApiError } from '@/lib/api';
import { useSession } from '@/lib/session';
import { Card, Button, ErrorNotice, LinkButton } from '@/components/ui';
import { OrganisationNav } from '@/components/organisation-nav';

/** `null` (no completed cycle yet) reads as "—", never a misleading "0h". */
function formatHours(hours: number | null): string {
  if (hours === null) return '—';
  if (hours < 48) return `${Math.round(hours)}h`;
  return `${(hours / 24).toFixed(1)}d`;
}

export default function OrganisationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user, ready } = useSession();

  const [organisation, setOrganisation] = useState<OrganisationSummary | null>(null);
  const [storage, setStorage] = useState<OrganisationStorageUsage | null>(null);
  const [storageUnavailable, setStorageUnavailable] = useState(false);
  const [usage, setUsage] = useState<OrganisationUsage | null>(null);
  const [usageUnavailable, setUsageUnavailable] = useState(false);
  const [quotaInput, setQuotaInput] = useState('');
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [pendingInvitations, setPendingInvitations] = useState<OrganisationInvitationView[]>([]);
  const [pendingInvitationsUnavailable, setPendingInvitationsUnavailable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    async (cancelledRef: { current: boolean }) => {
      try {
        const organisationsResult = await api.listOrganisations(user);
        if (cancelledRef.current) return;
        setOrganisation(organisationsResult.organisations.find((o) => o.id === id) ?? null);

        try {
          const storageResult = await api.getOrganisationStorage(id, user);
          if (cancelledRef.current) return;
          setStorage(storageResult);
          setStorageUnavailable(false);
        } catch {
          if (cancelledRef.current) return;
          setStorage(null);
          setStorageUnavailable(true);
        }

        try {
          const usageResult = await api.getOrganisationUsage(id, user);
          if (cancelledRef.current) return;
          setUsage(usageResult);
          setUsageUnavailable(false);
        } catch {
          if (cancelledRef.current) return;
          setUsage(null);
          setUsageUnavailable(true);
        }

        try {
          const workspacesResult = await api.listWorkspaces(user);
          if (cancelledRef.current) return;
          setWorkspaces(workspacesResult.workspaces.filter((w) => w.organisationId === id));
        } catch {
          if (cancelledRef.current) return;
          setWorkspaces([]);
        }

        try {
          const pending = await api.listPendingOrganisationInvitations(id, user);
          if (cancelledRef.current) return;
          setPendingInvitations(pending);
          setPendingInvitationsUnavailable(false);
        } catch {
          if (cancelledRef.current) return;
          setPendingInvitations([]);
          setPendingInvitationsUnavailable(true);
        }

        setError(null);
      } catch (caught) {
        if (cancelledRef.current) return;
        setError(caught instanceof ApiError ? caught.message : 'Something went wrong.');
      } finally {
        if (!cancelledRef.current) setLoading(false);
      }
    },
    [id, user],
  );

  useEffect(() => {
    if (!ready) return;

    const cancelledRef = { current: false };
    void load(cancelledRef);

    return () => {
      cancelledRef.current = true;
    };
  }, [ready, load]);

  const updateQuota = async (event: FormEvent) => {
    event.preventDefault();
    const gib = Number(quotaInput);
    if (!Number.isFinite(gib) || gib <= 0) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api.updateStorageQuota(
        id,
        { quotaBytes: Math.round(gib * 1024 * 1024 * 1024) },
        user,
      );
      setStorage(result);
      setQuotaInput('');
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <p role="status" className="text-[var(--color-ink-muted)]">
        Loading…
      </p>
    );
  }

  if (organisation === null) {
    return (
      <div className="space-y-4">
        <ErrorNotice message={error ?? `No organisation with id '${id}'.`} />
        <Link href="/organisations" className="text-sm underline">
          ← Back to organisations
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link href="/organisations" className="inline-block text-sm underline">
        ← Back to organisations
      </Link>

      {error !== null && <ErrorNotice message={error} />}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{organisation.name}</h1>
      </div>

      <OrganisationNav organisationId={id} />

      <section aria-labelledby="summary-heading">
        <h2 id="summary-heading" className="sr-only">
          Summary
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <Link href={`/organisations/${id}/programmes`} className="block">
            <Card className="h-full transition-colors hover:border-[var(--color-accent)]">
              <p className="text-sm text-[var(--color-ink-muted)]">Programmes</p>
              <p className="text-2xl font-semibold">{workspaces.length}</p>
            </Card>
          </Link>
          <Link href={`/organisations/${id}/people`} className="block">
            <Card className="h-full transition-colors hover:border-[var(--color-accent)]">
              <p className="text-sm text-[var(--color-ink-muted)]">Members</p>
              <p className="text-2xl font-semibold">
                {usageUnavailable ? '—' : (usage?.userCount ?? '—')}
              </p>
            </Card>
          </Link>
          <Link href={`/organisations/${id}/invitations`} className="block">
            <Card className="h-full transition-colors hover:border-[var(--color-accent)]">
              <p className="text-sm text-[var(--color-ink-muted)]">Outstanding invitations</p>
              <p className="text-2xl font-semibold">
                {pendingInvitationsUnavailable ? '—' : pendingInvitations.length}
              </p>
            </Card>
          </Link>
        </div>
      </section>

      <section aria-labelledby="storage-heading">
        <h2 id="storage-heading" className="mb-3 text-lg font-semibold">
          Storage
        </h2>
        <Card className="space-y-3">
          {storageUnavailable ? (
            <p className="text-sm text-[var(--color-ink-muted)]">
              Storage usage isn&apos;t available to your role.
            </p>
          ) : storage === null ? (
            <p className="text-sm text-[var(--color-ink-muted)]">Loading…</p>
          ) : (
            <>
              {(() => {
                const usedGiB = Number(storage.usedBytes) / (1024 * 1024 * 1024);
                const quotaGiB = Number(storage.quotaBytes) / (1024 * 1024 * 1024);
                const fraction = quotaGiB > 0 ? Math.min(1, usedGiB / quotaGiB) : 0;
                return (
                  <div role="status">
                    <p className="text-sm">
                      {usedGiB.toFixed(2)} GB of {quotaGiB.toFixed(0)} GB included used
                    </p>
                    <div
                      className="mt-2 h-2 w-full overflow-hidden rounded bg-[var(--color-line)]"
                      role="progressbar"
                      aria-valuenow={Math.round(fraction * 100)}
                      aria-valuemin={0}
                      aria-valuemax={100}
                    >
                      <div
                        className="h-full bg-[var(--color-accent)]"
                        style={{ width: `${fraction * 100}%` }}
                      />
                    </div>
                  </div>
                );
              })()}
              <form
                onSubmit={(event) => void updateQuota(event)}
                className="flex flex-wrap items-end gap-2 pt-2"
              >
                <div>
                  <label htmlFor="quotaInput" className="mb-1 block text-sm font-medium">
                    Set quota (GB) — operator override
                  </label>
                  <input
                    id="quotaInput"
                    type="number"
                    min="1"
                    step="1"
                    value={quotaInput}
                    onChange={(event) => setQuotaInput(event.target.value)}
                    placeholder="5"
                    className="w-32 rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2"
                  />
                </div>
                <Button type="submit" variant="secondary" disabled={busy || quotaInput === ''}>
                  {busy ? 'Updating…' : 'Update quota'}
                </Button>
              </form>
              <p className="text-xs text-[var(--color-ink-muted)]">
                Reaching quota blocks new uploads only — existing content is never removed. Export
                or remove content to free up space, or increase the quota here.
              </p>
            </>
          )}
        </Card>
      </section>

      <section aria-labelledby="usage-heading">
        <h2 id="usage-heading" className="mb-3 text-lg font-semibold">
          Usage
        </h2>
        <Card>
          {usageUnavailable ? (
            <p className="text-sm text-[var(--color-ink-muted)]">
              Usage isn&apos;t available to your role.
            </p>
          ) : usage === null ? (
            <p className="text-sm text-[var(--color-ink-muted)]">Loading…</p>
          ) : (
            <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
              {[
                ['Members', usage.userCount],
                ['Participants', usage.participantCount],
                ['Programs', usage.programCount],
                ['Sessions', usage.sessionCount],
                [
                  'Transcription jobs',
                  usage.transcriptionFailedCount > 0
                    ? `${usage.transcriptionJobCount} (${usage.transcriptionFailedCount} failed)`
                    : usage.transcriptionJobCount,
                ],
                [
                  'AI summary jobs',
                  usage.summaryFailedCount > 0
                    ? `${usage.aiProcessingJobCount} (${usage.summaryFailedCount} failed)`
                    : usage.aiProcessingJobCount,
                ],
                ['Reviews completed', usage.reviewsCompletedCount],
                ['Reports published', usage.reportsPublishedCount],
                ['Exports', usage.exportCount],
                [
                  'Session close → report published',
                  formatHours(usage.medianSessionCloseToPublishHours),
                ],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-[var(--color-ink-muted)]">{label}</dt>
                  <dd className="text-base font-medium">{value}</dd>
                </div>
              ))}
            </dl>
          )}
        </Card>
      </section>

      <div className="flex flex-wrap gap-3">
        <LinkButton href={`/organisations/${id}/consent-templates`}>Consent templates →</LinkButton>
      </div>
    </div>
  );
}
