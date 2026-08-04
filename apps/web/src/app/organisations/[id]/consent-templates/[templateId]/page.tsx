'use client';

/**
 * Consent template detail — content, version history, and lifecycle
 * controls (BUILD_ROADMAP.md Milestone 4, Consent Management).
 *
 * `expectedRevision` — not `expectedVersion` — backs the optimistic
 * concurrency check on activate/retire, matching
 * `ConsentTemplate.revision` (the row's own status-transition counter,
 * deliberately distinct from `version`, the template's content-version
 * number within its family). See `consent-template.ts` for why the two are
 * named differently.
 *
 * There is no "edit" control here — template versions are immutable once
 * created (BUILD_ROADMAP.md Milestone 4's core invariant). Changing content
 * means creating a new version, which becomes its own row and its own
 * detail page.
 */

import Link from 'next/link';
import { use, useCallback, useEffect, useState } from 'react';

import type { ConsentTemplateAction, ConsentTemplateDetail } from '@witness/contracts';

import { api, ApiError } from '@/lib/api';
import { useSession } from '@/lib/session';
import { Button, Card, ErrorNotice, LinkButton } from '@/components/ui';

const ACTION_LABELS: Record<ConsentTemplateAction['action'], string> = {
  activate: 'Activate',
  retire: 'Retire',
};

export default function ConsentTemplateDetailPage({
  params,
}: {
  params: Promise<{ id: string; templateId: string }>;
}) {
  const { id: organisationId, templateId } = use(params);
  const { user, ready } = useSession();

  const [template, setTemplate] = useState<ConsentTemplateDetail | null>(null);
  const [versions, setVersions] = useState<ConsentTemplateDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    async (cancelledRef: { current: boolean }) => {
      try {
        const [templateResult, versionsResult] = await Promise.all([
          api.getConsentTemplate(organisationId, templateId, user),
          api.getConsentTemplateVersions(organisationId, templateId, user),
        ]);
        if (cancelledRef.current) return;
        setTemplate(templateResult);
        setVersions(versionsResult.versions);
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

  const applyAction = async (action: ConsentTemplateAction['action']) => {
    if (template === null) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await api.applyConsentTemplateAction(
        organisationId,
        templateId,
        { action, expectedRevision: template.revision },
        user,
      );
      setTemplate(updated);
      const versionsResult = await api.getConsentTemplateVersions(organisationId, templateId, user);
      setVersions(versionsResult.versions);
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
        <ErrorNotice message="You do not have permission to view this consent template." />
        <Link
          href={`/organisations/${organisationId}/consent-templates`}
          className="text-sm underline"
        >
          ← Back to consent templates
        </Link>
      </div>
    );
  }

  if (template === null) {
    return (
      <div className="space-y-4">
        <ErrorNotice message={error ?? `No consent template with id '${templateId}'.`} />
        <Link
          href={`/organisations/${organisationId}/consent-templates`}
          className="text-sm underline"
        >
          ← Back to consent templates
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link
        href={`/organisations/${organisationId}/consent-templates`}
        className="inline-block text-sm underline"
      >
        ← Back to consent templates
      </Link>

      {error !== null && <ErrorNotice message={error} />}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{template.name}</h1>
          <p className="mt-1 text-sm text-[var(--color-ink-muted)]">
            Version {template.version} · {template.status}
          </p>
        </div>
        <LinkButton
          href={`/organisations/${organisationId}/consent-templates/${templateId}/new-version`}
        >
          Create new version
        </LinkButton>
      </div>

      <Card className="space-y-2 text-sm">
        <p>{template.purpose}</p>
        <p className="text-[var(--color-ink-muted)]">{template.plainLanguageSummary}</p>
        <p className="text-xs text-[var(--color-ink-muted)]">
          Languages: {template.supportedLanguages.join(', ')}
        </p>
      </Card>

      <section aria-labelledby="categories-heading">
        <h2 id="categories-heading" className="mb-3 text-lg font-semibold">
          Categories
        </h2>
        <Card>
          <ul className="space-y-1 text-sm">
            {template.categories.map((category) => (
              <li key={category.category} className="flex items-center justify-between">
                <span>{category.category.replace(/_/g, ' ')}</span>
                <span className="text-xs text-[var(--color-ink-muted)]">
                  {category.required ? 'Required' : 'Optional'}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </section>

      {template.permittedActions.length > 0 && (
        <section aria-labelledby="lifecycle-heading">
          <h2 id="lifecycle-heading" className="mb-3 text-lg font-semibold">
            Lifecycle
          </h2>
          <Card className="flex flex-wrap gap-2">
            {template.permittedActions.map((action) => (
              <Button
                key={action}
                variant={action === 'retire' ? 'danger' : 'primary'}
                disabled={busy}
                onClick={() => void applyAction(action)}
              >
                {ACTION_LABELS[action]}
              </Button>
            ))}
          </Card>
        </section>
      )}

      <section aria-labelledby="versions-heading">
        <h2 id="versions-heading" className="mb-3 text-lg font-semibold">
          Version history
        </h2>
        <Card>
          <ul className="space-y-2 text-sm">
            {versions.map((version) => (
              <li key={version.id} className="flex items-center justify-between">
                <Link
                  href={`/organisations/${organisationId}/consent-templates/${version.id}`}
                  className={version.id === template.id ? 'font-medium underline' : 'underline'}
                >
                  Version {version.version}
                </Link>
                <span className="text-xs text-[var(--color-ink-muted)]">{version.status}</span>
              </li>
            ))}
          </ul>
        </Card>
      </section>
    </div>
  );
}
