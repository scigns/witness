'use client';

/**
 * Create a new version of an existing consent template family
 * (BUILD_ROADMAP.md Milestone 4, Consent Management).
 *
 * Fields are seeded from the previous version and submitted only where
 * changed from their loaded value, mirroring
 * `createNewTemplateVersion`'s "inherits unless overridden" behaviour in
 * the domain layer — the previous version's row is never mutated by this
 * action, only read.
 */

import { useRouter } from 'next/navigation';
import { use, useCallback, useEffect, useState, type FormEvent } from 'react';

import type { ConsentTemplateDetail } from '@witness/contracts';

import { api, ApiError } from '@/lib/api';
import { useSession } from '@/lib/session';
import { Button, Card, ErrorNotice } from '@/components/ui';

export default function NewConsentTemplateVersionPage({
  params,
}: {
  params: Promise<{ id: string; templateId: string }>;
}) {
  const { id: organisationId, templateId } = use(params);
  const router = useRouter();
  const { user, ready } = useSession();

  const [previous, setPrevious] = useState<ConsentTemplateDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [purpose, setPurpose] = useState('');
  const [plainLanguageSummary, setPlainLanguageSummary] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    async (cancelledRef: { current: boolean }) => {
      try {
        const result = await api.getConsentTemplate(organisationId, templateId, user);
        if (cancelledRef.current) return;
        setPrevious(result);
        setName(result.name);
        setPurpose(result.purpose);
        setPlainLanguageSummary(result.plainLanguageSummary);
      } catch (caught) {
        if (cancelledRef.current) return;
        setError(caught instanceof ApiError ? caught.message : 'Something went wrong.');
      } finally {
        if (!cancelledRef.current) setLoading(false);
      }
    },
    [organisationId, templateId, user],
  );

  useEffect(() => {
    if (!ready) return;
    const cancelledRef = { current: false };
    void load(cancelledRef);
    return () => {
      cancelledRef.current = true;
    };
  }, [ready, load]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const created = await api.createConsentTemplateVersion(
        organisationId,
        templateId,
        { name, purpose, plainLanguageSummary },
        user,
      );
      router.push(`/organisations/${organisationId}/consent-templates/${created.id}`);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Something went wrong.');
      setBusy(false);
    }
  };

  if (loading) {
    return <p className="text-[var(--color-ink-muted)]">Loading…</p>;
  }

  if (previous === null) {
    return <ErrorNotice message={error ?? `No consent template with id '${templateId}'.`} />;
  }

  const canSubmit =
    !busy && name.trim() !== '' && purpose.trim() !== '' && plainLanguageSummary.trim() !== '';

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          New version of &ldquo;{previous.name}&rdquo;
        </h1>
        <p className="mt-1 text-[var(--color-ink-muted)]">
          Creates version {previous.version + 1} as a new draft. Version {previous.version} is never
          changed by this — sessions already using it keep exactly what they attached.
        </p>
      </div>

      {error !== null && <ErrorNotice message={error} />}

      <form onSubmit={(event) => void submit(event)} className="space-y-5">
        <Card className="space-y-4">
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
              className="w-full rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2"
            />
          </div>

          <div>
            <label htmlFor="purpose" className="mb-1 block text-sm font-medium">
              Purpose <span aria-hidden="true">*</span>
              <span className="sr-only">(required)</span>
            </label>
            <textarea
              id="purpose"
              required
              maxLength={2000}
              rows={2}
              value={purpose}
              onChange={(event) => setPurpose(event.target.value)}
              className="w-full rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2"
            />
          </div>

          <div>
            <label htmlFor="plainLanguageSummary" className="mb-1 block text-sm font-medium">
              Plain-language summary <span aria-hidden="true">*</span>
              <span className="sr-only">(required)</span>
            </label>
            <textarea
              id="plainLanguageSummary"
              required
              maxLength={5000}
              rows={3}
              value={plainLanguageSummary}
              onChange={(event) => setPlainLanguageSummary(event.target.value)}
              className="w-full rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2"
            />
          </div>

          <p className="text-xs text-[var(--color-ink-muted)]">
            Categories, supported languages, and validity dates carry over unchanged from version{' '}
            {previous.version}. Changing them is not yet supported from this form — use the API
            directly if a new version needs different categories.
          </p>
        </Card>

        <div className="flex gap-2">
          <Button type="submit" variant="primary" disabled={!canSubmit}>
            {busy ? 'Creating…' : 'Create version'}
          </Button>
        </div>
      </form>
    </div>
  );
}
