'use client';

/**
 * Knowledge Domains admin (3I) — governance groupings such as Community,
 * Governance, Needs, Cultural Knowledge, each carrying its own validation
 * policy (does confirming an assertion here need a second reviewer? community
 * validation? may it ever be published externally?). Configuring this is
 * `knowledge_domain:manage`, an organisation-admin-only action — the same
 * tier gap the originating request draws between "operate the platform" and
 * "govern this program's knowledge" (see `knowledge-governance.adversarial.test.ts`).
 */

import Link from 'next/link';
import { use, useCallback, useEffect, useState } from 'react';

import type {
  CreateKnowledgeDomainRequest,
  KnowledgeDomainView,
  WorkspaceSummary,
} from '@witness/contracts';

import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useSession } from '@/lib/session';
import { ProgramNav } from '@/components/program-nav';
import { KnowledgeNav } from '@/components/knowledge-nav';
import { Button, Card, EmptyState, ErrorNotice } from '@/components/ui';

const POLICY_FIELDS = [
  {
    key: 'requiresReviewerValidation' as const,
    label: 'Requires reviewer validation',
    help: 'A second person must confirm proposed knowledge before it counts.',
  },
  {
    key: 'requiresCommunityValidation' as const,
    label: 'Requires community validation',
    help: 'Beyond reviewer sign-off, the affected community must also validate it.',
  },
  {
    key: 'permitsExternalPublication' as const,
    label: 'Permits external publication',
    help: 'Confirmed knowledge in this domain may be shared outside the program.',
  },
];

export default function KnowledgeDomainsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user, ready } = useSession();
  const { currentUser } = useAuth();

  const [workspace, setWorkspace] = useState<WorkspaceSummary | null>(null);
  const [domains, setDomains] = useState<KnowledgeDomainView[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [formKey, setFormKey] = useState('');
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [savingPolicy, setSavingPolicy] = useState<string | null>(null);
  const [policyError, setPolicyError] = useState<string | null>(null);

  const load = useCallback(
    async (cancelledRef: { current: boolean }) => {
      try {
        const workspaceResult = await api.getWorkspace(id, user);
        if (cancelledRef.current) return;
        setWorkspace(workspaceResult);

        const result = await api.listKnowledgeDomains(workspaceResult.organisationId, id, user);
        if (cancelledRef.current) return;
        setDomains(result.domains);
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

  const role = currentUser?.workspaces.find((w) => w.id === id)?.role ?? null;
  const canManage = role === 'admin';

  const submitDomain = async () => {
    if (workspace === null) return;
    setSaving(true);
    setFormError(null);
    try {
      const request: CreateKnowledgeDomainRequest = {
        key: formKey.trim().toLowerCase().replace(/\s+/g, '_'),
        name: formName,
        ...(formDescription.trim() !== '' ? { description: formDescription.trim() } : {}),
      };
      await api.createKnowledgeDomain(workspace.organisationId, id, request, user);
      setFormKey('');
      setFormName('');
      setFormDescription('');
      setShowForm(false);
      const cancelledRef = { current: false };
      await load(cancelledRef);
    } catch (caught) {
      setFormError(caught instanceof ApiError ? caught.message : 'Something went wrong.');
    } finally {
      setSaving(false);
    }
  };

  const togglePolicy = async (
    domain: KnowledgeDomainView,
    field: keyof KnowledgeDomainView['validationPolicy'],
  ) => {
    if (workspace === null) return;
    setSavingPolicy(domain.id);
    setPolicyError(null);
    try {
      const updated = await api.updateKnowledgeDomainPolicy(
        workspace.organisationId,
        id,
        domain.id,
        { [field]: !domain.validationPolicy[field] },
        user,
      );
      setDomains((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
    } catch (caught) {
      setPolicyError(caught instanceof ApiError ? caught.message : 'Something went wrong.');
    } finally {
      setSavingPolicy(null);
    }
  };

  if (loading) {
    return (
      <p role="status" className="text-[var(--color-ink-muted)]">
        Loading…
      </p>
    );
  }

  if (workspace === null) {
    return (
      <div className="space-y-4">
        <ErrorNotice message={error ?? `No program with id '${id}'.`} />
        <Link href="/workspaces" className="text-sm underline">
          ← Back to programs
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link href={`/workspaces/${id}`} className="inline-block text-sm underline">
        ← Back to program
      </Link>

      {error !== null && <ErrorNotice message={error} />}

      <div className="max-w-2xl">
        <p className="text-sm font-medium text-[var(--color-accent)]">{workspace.name}</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Knowledge Domains</h1>
        <p className="mt-2 text-[var(--color-ink-muted)]">
          Governance areas — Community, Needs, Cultural Knowledge and similar — each with its own
          rules for what it takes to confirm something and whether it may leave the program.
        </p>
      </div>

      <ProgramNav workspaceId={id} role={role} />
      <KnowledgeNav workspaceId={id} role={role} />

      {canManage && (
        <Button variant="primary" onClick={() => setShowForm((v) => !v)}>
          {showForm ? 'Cancel' : 'New domain'}
        </Button>
      )}

      {showForm && (
        <Card className="space-y-3">
          {formError !== null && <ErrorNotice message={formError} />}
          <label className="block text-sm">
            <span className="mb-1 block text-[var(--color-ink-muted)]">Key (lower_snake_case)</span>
            <input
              type="text"
              value={formKey}
              onChange={(event) => setFormKey(event.target.value)}
              placeholder="cultural_knowledge"
              className="w-full rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-[var(--color-ink-muted)]">Name</span>
            <input
              type="text"
              value={formName}
              onChange={(event) => setFormName(event.target.value)}
              placeholder="Cultural Knowledge"
              className="w-full rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-[var(--color-ink-muted)]">Description (optional)</span>
            <textarea
              rows={2}
              value={formDescription}
              onChange={(event) => setFormDescription(event.target.value)}
              className="w-full rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2"
            />
          </label>
          <Button
            variant="primary"
            disabled={saving || formKey.trim() === '' || formName.trim() === ''}
            onClick={() => void submitDomain()}
          >
            {saving ? 'Saving…' : 'Create domain'}
          </Button>
        </Card>
      )}

      {policyError !== null && <ErrorNotice message={policyError} />}

      {domains.length === 0 ? (
        <EmptyState
          title="No domains configured"
          body="Without domains, every concept and relationship uses the default validation policy (reviewer confirmation, no community validation, no external publication)."
        />
      ) : (
        <ul className="space-y-3">
          {domains.map((domain) => (
            <li key={domain.id}>
              <Card className="space-y-3">
                <div>
                  <p className="font-medium">{domain.name}</p>
                  <p className="text-sm text-[var(--color-ink-muted)]">
                    {domain.key} · default sensitivity: {domain.defaultSensitivity}
                  </p>
                  {domain.description !== null && (
                    <p className="mt-1 text-sm">{domain.description}</p>
                  )}
                </div>
                <div className="flex flex-wrap gap-4">
                  {POLICY_FIELDS.map((field) => (
                    <label
                      key={field.key}
                      className="flex items-start gap-2 text-sm"
                      title={field.help}
                    >
                      <input
                        type="checkbox"
                        checked={domain.validationPolicy[field.key]}
                        disabled={!canManage || savingPolicy === domain.id}
                        onChange={() => void togglePolicy(domain, field.key)}
                        className="mt-0.5"
                      />
                      {field.label}
                    </label>
                  ))}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
