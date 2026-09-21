'use client';

/**
 * Concept Explorer — list (3C). Every row is a `KnowledgeEntity`: an
 * identity, not a claim — the claims (attributes, relationships) live on
 * its detail page, each citing the evidence and reviewer that put it there.
 */

import Link from 'next/link';
import { use, useCallback, useEffect, useState } from 'react';

import {
  KNOWLEDGE_ENTITY_TYPES,
  TOPIC_SCHEMES,
  type CreateKnowledgeEntityRequest,
  type KnowledgeEntityType,
  type KnowledgeEntityView,
  type WorkspaceSummary,
} from '@witness/contracts';

import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useSession } from '@/lib/session';
import { ProgramNav } from '@/components/program-nav';
import { KnowledgeNav } from '@/components/knowledge-nav';
import { Button, Card, EmptyState, ErrorNotice } from '@/components/ui';

const CAN_PROPOSE_ROLES = new Set(['admin', 'facilitator', 'contributor', 'steward']);

const ENTITY_TYPE_LABELS: Record<KnowledgeEntityType, string> = {
  person: 'Person',
  community: 'Community',
  organisation: 'Organisation',
  project: 'Project',
  meeting: 'Meeting',
  policy: 'Policy',
  evidence: 'Evidence',
  risk: 'Risk',
  decision: 'Decision',
  action: 'Action',
  commitment: 'Commitment',
  location: 'Location',
  topic: 'Topic',
};

function SensitivityBadge({ sensitivityClass }: { sensitivityClass: string }) {
  const classes: Record<string, string> = {
    public: 'border-current text-[var(--color-ink-muted)]',
    internal: 'border-current text-[var(--color-ink-muted)]',
    confidential: 'border-amber-600 text-amber-700 dark:text-amber-400',
    restricted: 'border-red-700 text-red-700 dark:text-red-400',
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${classes[sensitivityClass] ?? classes['internal']}`}
    >
      {sensitivityClass}
      {(sensitivityClass === 'confidential' || sensitivityClass === 'restricted') && (
        <span aria-hidden="true">🔒</span>
      )}
    </span>
  );
}

export default function ConceptsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user, ready } = useSession();
  const { currentUser } = useAuth();

  const [workspace, setWorkspace] = useState<WorkspaceSummary | null>(null);
  const [entities, setEntities] = useState<KnowledgeEntityView[]>([]);
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [showForm, setShowForm] = useState(false);
  const [formEntityType, setFormEntityType] = useState<KnowledgeEntityType>('topic');
  const [formTopicScheme, setFormTopicScheme] = useState<string>('general_concept');
  const [formLabel, setFormLabel] = useState('');
  const [formDefinition, setFormDefinition] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(
    async (cancelledRef: { current: boolean }) => {
      try {
        const workspaceResult = await api.getWorkspace(id, user);
        if (cancelledRef.current) return;
        setWorkspace(workspaceResult);

        const entitiesResult = await api.listKnowledgeEntities(
          workspaceResult.organisationId,
          id,
          user,
          typeFilter || undefined,
        );
        if (cancelledRef.current) return;
        setEntities(entitiesResult.entities);
        setError(null);
      } catch (caught) {
        if (cancelledRef.current) return;
        setError(caught instanceof ApiError ? caught.message : 'Something went wrong.');
      } finally {
        if (!cancelledRef.current) setLoading(false);
      }
    },
    [id, user, typeFilter],
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
  const canPropose = role !== null && CAN_PROPOSE_ROLES.has(role);

  const submitConcept = async () => {
    if (workspace === null) return;
    setSaving(true);
    setFormError(null);
    try {
      const request: CreateKnowledgeEntityRequest = {
        entityType: formEntityType,
        canonicalLabel: formLabel,
        ...(formEntityType === 'topic' ? { topicScheme: formTopicScheme as never } : {}),
        ...(formDefinition.trim() !== '' ? { definition: formDefinition.trim() } : {}),
      };
      await api.createKnowledgeEntity(workspace.organisationId, id, request, user);
      setFormLabel('');
      setFormDefinition('');
      setShowForm(false);
      const cancelledRef = { current: false };
      await load(cancelledRef);
    } catch (caught) {
      setFormError(caught instanceof ApiError ? caught.message : 'Something went wrong.');
    } finally {
      setSaving(false);
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
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Concepts</h1>
      </div>

      <ProgramNav workspaceId={id} role={role} />
      <KnowledgeNav workspaceId={id} role={role} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm">
          <span className="text-[var(--color-ink-muted)]">Type</span>
          <select
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value)}
            className="rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-2 py-1"
          >
            <option value="">All types</option>
            {KNOWLEDGE_ENTITY_TYPES.map((t) => (
              <option key={t} value={t}>
                {ENTITY_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </label>
        {canPropose && (
          <Button variant="primary" onClick={() => setShowForm((v) => !v)}>
            {showForm ? 'Cancel' : 'Propose a concept'}
          </Button>
        )}
      </div>

      {showForm && (
        <Card className="space-y-3">
          <h2 className="font-semibold">Propose a new concept</h2>
          <p className="text-sm text-[var(--color-ink-muted)]">
            A concept is an identity — a person, place, topic or similar — not yet a claim about it.
            Facts about it (its role, its relationships) are proposed separately, each citing
            evidence.
          </p>
          {formError !== null && <ErrorNotice message={formError} />}
          <label className="block text-sm">
            <span className="mb-1 block text-[var(--color-ink-muted)]">Type</span>
            <select
              value={formEntityType}
              onChange={(event) => setFormEntityType(event.target.value as KnowledgeEntityType)}
              className="w-full rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2"
            >
              {KNOWLEDGE_ENTITY_TYPES.map((t) => (
                <option key={t} value={t}>
                  {ENTITY_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </label>
          {formEntityType === 'topic' && (
            <label className="block text-sm">
              <span className="mb-1 block text-[var(--color-ink-muted)]">Topic scheme</span>
              <select
                value={formTopicScheme}
                onChange={(event) => setFormTopicScheme(event.target.value)}
                className="w-full rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2"
              >
                {TOPIC_SCHEMES.map((s) => (
                  <option key={s} value={s}>
                    {s.replace(/_/g, ' ')}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="block text-sm">
            <span className="mb-1 block text-[var(--color-ink-muted)]">Canonical label</span>
            <input
              type="text"
              value={formLabel}
              onChange={(event) => setFormLabel(event.target.value)}
              maxLength={300}
              placeholder="e.g. Minister of Housing"
              className="w-full rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-[var(--color-ink-muted)]">Definition (optional)</span>
            <textarea
              rows={3}
              value={formDefinition}
              onChange={(event) => setFormDefinition(event.target.value)}
              maxLength={5000}
              className="w-full rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2"
            />
          </label>
          <Button
            variant="primary"
            disabled={saving || formLabel.trim() === ''}
            onClick={() => void submitConcept()}
          >
            {saving ? 'Saving…' : 'Create concept'}
          </Button>
        </Card>
      )}

      {entities.length === 0 ? (
        <EmptyState
          title="No concepts yet"
          body="Concepts — people, organisations, topics and more — appear here once proposed from evidence."
        />
      ) : (
        <ul className="space-y-2">
          {entities.map((entity) => (
            <li key={entity.id}>
              <Link
                href={`/workspaces/${id}/knowledge/concepts/${entity.id}`}
                className="block rounded-lg focus-visible:outline-none"
              >
                <Card className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">{entity.canonicalLabel}</p>
                    <p className="mt-0.5 text-sm text-[var(--color-ink-muted)]">
                      {ENTITY_TYPE_LABELS[entity.entityType]}
                      {entity.topicScheme ? ` · ${entity.topicScheme.replace(/_/g, ' ')}` : ''}
                      {' · '}
                      {entity.aliasCount} alias{entity.aliasCount === 1 ? '' : 'es'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <SensitivityBadge sensitivityClass={entity.sensitivityClass} />
                  </div>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
