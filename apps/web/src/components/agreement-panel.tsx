'use client';

/**
 * Billing-page visibility for an organisation's commercial agreement (Phase
 * 5, Workstream 2.4) — "when does this organisation need to be renewed, and
 * under what authority is their paid access justified" made visible in the
 * product instead of living only in an operator's memory. Mutating actions
 * (create/renew/terminate) are rendered for anyone viewing the billing page;
 * the API is the actual enforcement point (`agreement:create` etc. are
 * `admin`/`billing_manager`-only), so a member without that authority sees
 * the same 403 message here that any other billing action already surfaces.
 */

import { useCallback, useEffect, useState } from 'react';

import type { AgreementView } from '@witness/contracts';

import { api, ApiError, type ActingUser } from '@/lib/api';
import { Button, Card, ErrorNotice } from '@/components/ui';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' });
}

const STATUS_LABELS: Record<AgreementView['effectiveStatus'], string> = {
  ACTIVE: 'Active',
  EXPIRED: 'Expired',
  TERMINATED: 'Terminated',
  SUPERSEDED: 'Superseded',
};

function StatusBadge({ status }: { status: AgreementView['effectiveStatus'] }) {
  const tone =
    status === 'ACTIVE'
      ? 'bg-[var(--color-accent-soft)] text-[var(--color-ink)]'
      : status === 'EXPIRED'
        ? 'bg-[var(--color-attention)] text-white'
        : 'bg-[var(--color-paper)] text-[var(--color-ink-muted)] border border-[var(--color-line)]';
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-medium ${tone}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}

interface TermFormValue {
  reference: string;
  termStart: string;
  termEnd: string;
  notes: string;
}

const EMPTY_FORM: TermFormValue = { reference: '', termStart: '', termEnd: '', notes: '' };

function TermForm({
  value,
  onChange,
  submitLabel,
  onSubmit,
  busy,
}: {
  value: TermFormValue;
  onChange: (next: TermFormValue) => void;
  submitLabel: string;
  onSubmit: () => void;
  busy: boolean;
}) {
  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <label className="text-sm sm:col-span-2">
        Reference (contract, PO, or pilot agreement number)
        <input
          required
          type="text"
          maxLength={200}
          value={value.reference}
          onChange={(event) => onChange({ ...value, reference: event.target.value })}
          className="mt-1 w-full rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-1.5 text-sm"
        />
      </label>
      <label className="text-sm">
        Term start
        <input
          required
          type="date"
          value={value.termStart}
          onChange={(event) => onChange({ ...value, termStart: event.target.value })}
          className="mt-1 w-full rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-1.5 text-sm"
        />
      </label>
      <label className="text-sm">
        Term end (optional — leave blank for open-ended)
        <input
          type="date"
          value={value.termEnd}
          onChange={(event) => onChange({ ...value, termEnd: event.target.value })}
          className="mt-1 w-full rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-1.5 text-sm"
        />
      </label>
      <label className="text-sm sm:col-span-2">
        Notes (optional)
        <textarea
          maxLength={2000}
          rows={2}
          value={value.notes}
          onChange={(event) => onChange({ ...value, notes: event.target.value })}
          className="mt-1 w-full rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-1.5 text-sm"
        />
      </label>
      <div className="sm:col-span-2">
        <Button type="submit" variant="primary" disabled={busy}>
          {busy ? 'Saving…' : submitLabel}
        </Button>
      </div>
    </form>
  );
}

export function AgreementPanel({
  organisationId,
  user,
}: {
  organisationId: string;
  user: ActingUser;
}) {
  const [agreements, setAgreements] = useState<AgreementView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<'view' | 'create' | 'renew'>('view');
  const [form, setForm] = useState<TermFormValue>(EMPTY_FORM);
  const [terminateReason, setTerminateReason] = useState('');
  const [showTerminate, setShowTerminate] = useState(false);

  const load = useCallback(async () => {
    try {
      setAgreements(await api.listAgreements(organisationId, user));
      setError(null);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'The agreement could not be loaded.');
    }
  }, [organisationId, user]);

  useEffect(() => {
    void load();
  }, [load]);

  if (agreements === null) {
    return (
      <section aria-labelledby="agreement-heading" className="space-y-3">
        <h2 id="agreement-heading" className="text-xl font-semibold">
          Agreement
        </h2>
        <p role="status" className="text-sm text-[var(--color-ink-muted)]">
          Loading…
        </p>
      </section>
    );
  }

  const active = agreements.find((agreement) => agreement.status === 'ACTIVE') ?? null;
  const history = agreements.filter((agreement) => agreement.id !== active?.id);

  const toRequestBody = () => ({
    reference: form.reference,
    termStart: new Date(`${form.termStart}T00:00:00.000Z`).toISOString(),
    termEnd: form.termEnd ? new Date(`${form.termEnd}T00:00:00.000Z`).toISOString() : null,
    notes: form.notes.trim() === '' ? null : form.notes,
  });

  const submitCreate = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.createAgreement(organisationId, toRequestBody(), user);
      setMode('view');
      setForm(EMPTY_FORM);
      await load();
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.message : 'The agreement could not be recorded.',
      );
    } finally {
      setBusy(false);
    }
  };

  const submitRenew = async () => {
    if (!active) return;
    setBusy(true);
    setError(null);
    try {
      await api.renewAgreement(organisationId, active.id, toRequestBody(), user);
      setMode('view');
      setForm(EMPTY_FORM);
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'The renewal could not be recorded.');
    } finally {
      setBusy(false);
    }
  };

  const submitTerminate = async () => {
    if (!active || terminateReason.trim() === '') return;
    setBusy(true);
    setError(null);
    try {
      await api.terminateAgreement(organisationId, active.id, { reason: terminateReason }, user);
      setShowTerminate(false);
      setTerminateReason('');
      await load();
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.message : 'The termination could not be recorded.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="agreement-heading" className="space-y-4">
      <h2 id="agreement-heading" className="text-xl font-semibold">
        Agreement
      </h2>
      {error && <ErrorNotice message={error} />}

      {active ? (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-medium">{active.reference}</p>
            <StatusBadge status={active.effectiveStatus} />
          </div>
          <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
            {formatDate(active.termStart)} –{' '}
            {active.termEnd ? formatDate(active.termEnd) : 'open-ended'}
          </p>
          {active.notes && <p className="mt-2 text-sm">{active.notes}</p>}
          {mode === 'view' && (
            <div className="mt-4 flex flex-wrap gap-3">
              <Button
                onClick={() => {
                  setForm(EMPTY_FORM);
                  setMode('renew');
                }}
              >
                Renew
              </Button>
              <Button variant="danger" onClick={() => setShowTerminate((current) => !current)}>
                Terminate
              </Button>
            </div>
          )}
          {showTerminate && (
            <form
              className="mt-4 space-y-2"
              onSubmit={(event) => {
                event.preventDefault();
                void submitTerminate();
              }}
            >
              <label className="block text-sm">
                Reason for termination
                <input
                  required
                  type="text"
                  maxLength={500}
                  value={terminateReason}
                  onChange={(event) => setTerminateReason(event.target.value)}
                  className="mt-1 w-full rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-1.5 text-sm"
                />
              </label>
              <Button type="submit" variant="danger" disabled={busy}>
                {busy ? 'Terminating…' : 'Confirm termination'}
              </Button>
            </form>
          )}
          {mode === 'renew' && (
            <div className="mt-4 border-t border-[var(--color-line)] pt-4">
              <p className="mb-2 text-sm font-medium">Renew this agreement</p>
              <TermForm
                value={form}
                onChange={setForm}
                submitLabel="Record renewal"
                onSubmit={() => void submitRenew()}
                busy={busy}
              />
              <button
                type="button"
                className="mt-2 text-sm underline"
                onClick={() => setMode('view')}
              >
                Cancel
              </button>
            </div>
          )}
        </Card>
      ) : mode === 'create' ? (
        <Card>
          <p className="mb-2 text-sm font-medium">Record this organisation&rsquo;s agreement</p>
          <TermForm
            value={form}
            onChange={setForm}
            submitLabel="Record agreement"
            onSubmit={() => void submitCreate()}
            busy={busy}
          />
          <button type="button" className="mt-2 text-sm underline" onClick={() => setMode('view')}>
            Cancel
          </button>
        </Card>
      ) : (
        <Card>
          <p className="text-sm text-[var(--color-ink-muted)]">
            No agreement has been recorded for this organisation yet.
          </p>
          <Button
            variant="primary"
            onClick={() => {
              setForm(EMPTY_FORM);
              setMode('create');
            }}
          >
            Record an agreement
          </Button>
        </Card>
      )}

      {history.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer font-medium">History ({history.length})</summary>
          <ul className="mt-2 space-y-2">
            {history.map((agreement) => (
              <li
                key={agreement.id}
                className="rounded border border-[var(--color-line)] p-3 text-[var(--color-ink-muted)]"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium text-[var(--color-ink)]">{agreement.reference}</span>
                  <StatusBadge status={agreement.effectiveStatus} />
                </div>
                <p>
                  {formatDate(agreement.termStart)} –{' '}
                  {agreement.termEnd ? formatDate(agreement.termEnd) : 'open-ended'}
                </p>
                {agreement.statusReason && <p>{agreement.statusReason}</p>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
