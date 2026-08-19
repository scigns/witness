'use client';

/**
 * Consent template list for an organisation (BUILD_ROADMAP.md Milestone 4,
 * Consent Management) — one row per template family, showing its latest
 * version (`ConsentTemplatesService.list`'s "latest per family" semantics).
 */

import Link from 'next/link';
import { use, useCallback, useEffect, useState } from 'react';

import type { ConsentTemplateSummary, ConsentTemplateStatus } from '@witness/contracts';

import { api, ApiError } from '@/lib/api';
import { useSession } from '@/lib/session';
import { Card, ErrorNotice, LinkButton } from '@/components/ui';

const STATUS_LABELS: Record<ConsentTemplateStatus, string> = {
  draft: 'Draft',
  active: 'Active',
  retired: 'Retired',
};

const STATUS_CLASSES: Record<ConsentTemplateStatus, string> = {
  draft: 'border-current text-[var(--color-ink-muted)]',
  active: 'border-emerald-700 text-emerald-700 dark:text-emerald-400',
  retired: 'border-current text-[var(--color-ink-muted)]',
};

function StatusBadge({ status }: { status: ConsentTemplateStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_CLASSES[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

export default function ConsentTemplatesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: organisationId } = use(params);
  const { user, ready } = useSession();

  const [templates, setTemplates] = useState<ConsentTemplateSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);

  const load = useCallback(
    async (cancelledRef: { current: boolean }) => {
      try {
        const result = await api.listConsentTemplates(organisationId, user);
        if (cancelledRef.current) return;
        setTemplates(result.templates);
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
    [organisationId, user],
  );

  useEffect(() => {
    if (!ready) return;
    const cancelledRef = { current: false };
    void load(cancelledRef);
    return () => {
      cancelledRef.current = true;
    };
  }, [ready, load]);

  if (loading) {
    return (
      <p role="status" className="text-[var(--color-ink-muted)]">
        Loading…
      </p>
    );
  }

  if (forbidden) {
    return (
      <div className="space-y-4">
        <ErrorNotice message="You do not have permission to view consent templates for this organisation." />
        <Link href={`/organisations/${organisationId}`} className="text-sm underline">
          ← Back to organisation
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link href={`/organisations/${organisationId}`} className="inline-block text-sm underline">
        ← Back to organisation
      </Link>

      {error !== null && <ErrorNotice message={error} />}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Consent templates</h1>
        <LinkButton
          href={`/organisations/${organisationId}/consent-templates/new`}
          variant="primary"
        >
          New template
        </LinkButton>
      </div>
      <p className="text-sm text-[var(--color-ink-muted)]">
        A versioned statement of what a co-design session may ask a participant to agree to.
        Template versions are immutable once created — changing one creates a new version rather
        than editing the old one.
      </p>

      {templates.length === 0 ? (
        <Card>
          <p className="text-sm text-[var(--color-ink-muted)]">
            No consent templates yet. Create one before configuring consent for a session.
          </p>
        </Card>
      ) : (
        <ul className="space-y-3">
          {templates.map((template) => (
            <li key={template.id}>
              <Link
                href={`/organisations/${organisationId}/consent-templates/${template.id}`}
                className="block"
              >
                <Card className="flex flex-wrap items-center justify-between gap-3 transition-colors hover:bg-[var(--color-accent-soft)]">
                  <div>
                    <p className="font-medium">{template.name}</p>
                    <p className="text-xs text-[var(--color-ink-muted)]">
                      Version {template.version}
                      {template.workspaceId !== null
                        ? ' · Workspace-specific'
                        : ' · Organisation-wide'}
                    </p>
                  </div>
                  <StatusBadge status={template.status} />
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
