'use client';

/**
 * Knowledge Steward Workspace (3F) — currently just concept merging, the
 * one steward-exclusive action (`knowledge_entity:steward`) that isn't
 * already reachable from the Concepts pages (creating concepts and aliases
 * is `knowledge_concept:suggest`, shared with contributors). Preview always
 * runs before merge, and never writes anything itself (3F: "provide preview
 * before merge; never destroy provenance").
 */

import Link from 'next/link';
import { use, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

import type {
  KnowledgeEntityView,
  MergeKnowledgeEntitiesPreview,
  WorkspaceSummary,
} from '@witness/contracts';

import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useSession } from '@/lib/session';
import { ProgramNav } from '@/components/program-nav';
import { KnowledgeNav } from '@/components/knowledge-nav';
import { Button, Card, ErrorNotice } from '@/components/ui';

export default function StewardshipPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user, ready } = useSession();
  const { currentUser } = useAuth();
  const searchParams = useSearchParams();

  const [workspace, setWorkspace] = useState<WorkspaceSummary | null>(null);
  const [entities, setEntities] = useState<KnowledgeEntityView[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [survivingId, setSurvivingId] = useState('');
  const [mergedId, setMergedId] = useState('');
  const [preview, setPreview] = useState<MergeKnowledgeEntitiesPreview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const [rationale, setRationale] = useState('');
  const [elevatedConfirmed, setElevatedConfirmed] = useState(false);
  const [merging, setMerging] = useState(false);
  const [mergeError, setMergeError] = useState<string | null>(null);
  const [merged, setMerged] = useState(false);

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
        );
        if (cancelledRef.current) return;
        setEntities(entitiesResult.entities);
        setError(null);

        const preselected = searchParams.get('entityId');
        if (preselected !== null) setSurvivingId(preselected);
      } catch (caught) {
        if (cancelledRef.current) return;
        setError(caught instanceof ApiError ? caught.message : 'Something went wrong.');
      } finally {
        if (!cancelledRef.current) setLoading(false);
      }
    },
    [id, user, searchParams],
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

  const runPreview = async () => {
    if (workspace === null || survivingId === '' || mergedId === '') return;
    setPreviewing(true);
    setPreviewError(null);
    setPreview(null);
    setMerged(false);
    try {
      const result = await api.previewKnowledgeEntityMerge(
        workspace.organisationId,
        id,
        survivingId,
        mergedId,
        user,
      );
      setPreview(result);
    } catch (caught) {
      setPreviewError(caught instanceof ApiError ? caught.message : 'Something went wrong.');
    } finally {
      setPreviewing(false);
    }
  };

  const runMerge = async () => {
    if (workspace === null) return;
    setMerging(true);
    setMergeError(null);
    try {
      await api.mergeKnowledgeEntities(
        workspace.organisationId,
        id,
        survivingId,
        {
          mergedEntityId: mergedId,
          rationale,
          ...(elevatedConfirmed ? { elevatedAuthorityConfirmed: true } : {}),
        },
        user,
      );
      setMerged(true);
      setPreview(null);
      setRationale('');
      const cancelledRef = { current: false };
      await load(cancelledRef);
    } catch (caught) {
      setMergeError(caught instanceof ApiError ? caught.message : 'Something went wrong.');
    } finally {
      setMerging(false);
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

  const activeEntities = entities.filter((e) => e.status === 'active');

  return (
    <div className="space-y-6">
      <Link href={`/workspaces/${id}`} className="inline-block text-sm underline">
        ← Back to program
      </Link>

      {error !== null && <ErrorNotice message={error} />}
      {error !== null && error.toLowerCase().includes('permission') && (
        <p className="text-sm text-[var(--color-ink-muted)]">
          Stewardship is available to Knowledge Stewards and administrators.
        </p>
      )}

      <div className="max-w-2xl">
        <p className="text-sm font-medium text-[var(--color-accent)]">{workspace.name}</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Stewardship</h1>
        <p className="mt-2 text-[var(--color-ink-muted)]">
          Merge duplicate concepts. Nothing is written until you confirm — the preview below shows
          exactly what will change.
        </p>
      </div>

      <ProgramNav workspaceId={id} role={role} />
      <KnowledgeNav workspaceId={id} role={role} />

      <section aria-labelledby="merge-heading" className="space-y-3">
        <h2 id="merge-heading" className="text-lg font-semibold">
          Merge concepts
        </h2>
        <Card className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block text-[var(--color-ink-muted)]">Concept to keep</span>
              <select
                value={survivingId}
                onChange={(event) => {
                  setSurvivingId(event.target.value);
                  setPreview(null);
                  setMerged(false);
                }}
                className="w-full rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2"
              >
                <option value="">Select…</option>
                {activeEntities.map((entity) => (
                  <option key={entity.id} value={entity.id}>
                    {entity.canonicalLabel} ({entity.entityType})
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-[var(--color-ink-muted)]">
                Duplicate concept to merge in
              </span>
              <select
                value={mergedId}
                onChange={(event) => {
                  setMergedId(event.target.value);
                  setPreview(null);
                  setMerged(false);
                }}
                className="w-full rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2"
              >
                <option value="">Select…</option>
                {activeEntities.map((entity) => (
                  <option key={entity.id} value={entity.id}>
                    {entity.canonicalLabel} ({entity.entityType})
                  </option>
                ))}
              </select>
            </label>
          </div>

          <Button
            variant="secondary"
            disabled={
              previewing || survivingId === '' || mergedId === '' || survivingId === mergedId
            }
            onClick={() => void runPreview()}
          >
            {previewing ? 'Checking…' : 'Preview merge'}
          </Button>

          {previewError !== null && <ErrorNotice message={previewError} />}

          {preview !== null && (
            <div className="space-y-3 rounded border border-[var(--color-line)] bg-[var(--color-paper)] p-4">
              <p className="text-sm">
                <strong>{preview.survivingEntity.canonicalLabel}</strong> would absorb{' '}
                <strong>{preview.mergedEntity.canonicalLabel}</strong>, which would be tombstoned
                (never deleted) with a link back for history.
              </p>
              <ul className="space-y-1 text-sm text-[var(--color-ink-muted)]">
                <li>{preview.aliasesToCarryOver} alias(es) will move to the surviving concept.</li>
                <li>
                  {preview.attributesOnMergedEntity} attribute(s) and{' '}
                  {preview.relationshipsOnMergedEntity} relationship(s) on the merged concept keep
                  citing it by id — they are not deleted or rewritten.
                </li>
              </ul>

              {!preview.canMerge ? (
                <ErrorNotice
                  message={preview.blockingReason ?? 'This merge cannot proceed as described.'}
                />
              ) : (
                <div className="space-y-3">
                  {preview.requiresElevatedAuthority && (
                    <div className="rounded border border-amber-600 bg-amber-950/20 p-3 text-sm text-amber-700 dark:text-amber-400">
                      <p className="font-medium">This merge needs elevated authority.</p>
                      <p className="mt-1">
                        Linking a community identity to a named person — or merging two community
                        identities — is a re-identification event.
                      </p>
                      <label className="mt-2 flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={elevatedConfirmed}
                          onChange={(event) => setElevatedConfirmed(event.target.checked)}
                        />
                        I have the authority to confirm this merge
                      </label>
                    </div>
                  )}
                  <label className="block text-sm">
                    <span className="mb-1 block text-[var(--color-ink-muted)]">
                      Rationale (required)
                    </span>
                    <textarea
                      rows={2}
                      value={rationale}
                      onChange={(event) => setRationale(event.target.value)}
                      className="w-full rounded border border-[var(--color-line)] bg-[var(--color-paper-raised)] px-3 py-2 text-sm"
                    />
                  </label>
                  {mergeError !== null && <ErrorNotice message={mergeError} />}
                  <Button
                    variant="primary"
                    disabled={
                      merging ||
                      rationale.trim() === '' ||
                      (preview.requiresElevatedAuthority && !elevatedConfirmed)
                    }
                    onClick={() => void runMerge()}
                  >
                    {merging ? 'Merging…' : 'Confirm merge'}
                  </Button>
                  <p className="text-xs text-[var(--color-ink-muted)]">Reversible for 30 days.</p>
                </div>
              )}
            </div>
          )}

          {merged && (
            <p className="text-sm text-emerald-700 dark:text-emerald-400">
              Merge complete.{' '}
              <Link
                href={`/workspaces/${id}/knowledge/concepts/${survivingId}`}
                className="underline"
              >
                View the surviving concept →
              </Link>
            </p>
          )}
        </Card>
      </section>
    </div>
  );
}
