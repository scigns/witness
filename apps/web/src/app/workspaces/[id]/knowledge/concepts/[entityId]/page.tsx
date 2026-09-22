'use client';

/**
 * Concept detail (3C) + Relationship Inspector (3D, folded in here rather
 * than a separate page — a relationship is always inspected *from* one of
 * its endpoints). "Why is this here?" expands a relationship into its
 * provenance: which evidence, who confirmed it, and how.
 *
 * The Relationships and History sections both read the Neo4j-backed graph
 * projection, which is disposable and rebuildable by design (ADR-0011) — if
 * it is mid-rebuild or unreachable, this page must still show the concept
 * itself (Postgres-backed, always available), degrading only those two
 * sections rather than the whole page.
 */

import Link from 'next/link';
import { use, useCallback, useEffect, useState } from 'react';

import type {
  EntityAliasView,
  GraphEdge,
  GraphNode,
  KnowledgeEntityView,
  ProvenanceRecord,
  WorkspaceSummary,
} from '@witness/contracts';

import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useSession } from '@/lib/session';
import { ProgramNav } from '@/components/program-nav';
import { KnowledgeNav } from '@/components/knowledge-nav';
import { Button, Card, ErrorNotice } from '@/components/ui';

const CAN_PROPOSE_ROLES = new Set(['admin', 'facilitator', 'contributor', 'steward']);
const STEWARD_ROLES = new Set(['admin', 'steward']);

const PERSPECTIVE_TAG_LABELS: Record<string, string> = {
  contested: 'Contested',
  minority_perspective: 'Minority perspective',
  culturally_significant: 'Culturally significant',
  unresolved: 'Unresolved',
  community_restricted: 'Community-restricted',
  machine_inferred: 'Machine-inferred',
};

function PerspectiveTagBadge({ tag }: { tag: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-amber-600 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
      ⚑ {PERSPECTIVE_TAG_LABELS[tag] ?? tag}
    </span>
  );
}

/**
 * The graph-backed endpoints go through a Neo4j driver with its own,
 * much longer, connection-level timeout — if the projection is
 * unreachable, a raw `await` here would leave the whole page on
 * "Loading…" far longer than a user should ever wait for a section that
 * is explicitly allowed to degrade. Bounding it client-side is what
 * actually makes the degrade-gracefully behaviour below take effect in a
 * reasonable time.
 */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);
}

interface RelationshipRow {
  edge: GraphEdge;
  otherNode: GraphNode | undefined;
  direction: 'from' | 'to';
}

export default function ConceptDetailPage({
  params,
}: {
  params: Promise<{ id: string; entityId: string }>;
}) {
  const { id, entityId } = use(params);
  const { user, ready } = useSession();
  const { currentUser } = useAuth();

  const [workspace, setWorkspace] = useState<WorkspaceSummary | null>(null);
  const [entity, setEntity] = useState<KnowledgeEntityView | null>(null);
  const [aliases, setAliases] = useState<EntityAliasView[]>([]);
  const [relationships, setRelationships] = useState<RelationshipRow[] | null>(null);
  const [graphUnavailable, setGraphUnavailable] = useState(false);
  const [nodeProvenance, setNodeProvenance] = useState<ProvenanceRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notFound404, setNotFound404] = useState(false);
  const [loading, setLoading] = useState(true);

  const [aliasText, setAliasText] = useState('');
  const [addingAlias, setAddingAlias] = useState(false);
  const [aliasError, setAliasError] = useState<string | null>(null);

  const [inspecting, setInspecting] = useState<string | null>(null);
  const [inspectionResult, setInspectionResult] = useState<ProvenanceRecord[] | null>(null);
  const [inspectionError, setInspectionError] = useState<string | null>(null);

  const load = useCallback(
    async (cancelledRef: { current: boolean }) => {
      try {
        const workspaceResult = await api.getWorkspace(id, user);
        if (cancelledRef.current) return;
        setWorkspace(workspaceResult);

        const [entityResult, aliasesResult] = await Promise.all([
          api.getKnowledgeEntity(workspaceResult.organisationId, id, entityId, user),
          api.listKnowledgeEntityAliases(workspaceResult.organisationId, id, entityId, user),
        ]);
        if (cancelledRef.current) return;
        setEntity(entityResult);
        setAliases(aliasesResult.aliases);
        setError(null);

        // Graph-backed sections — degrade gracefully, never block the page.
        try {
          const [neighbourhood, provenance] = await withTimeout(
            Promise.all([
              api.getKnowledgeGraphNeighbourhood(
                workspaceResult.organisationId,
                id,
                entityId,
                user,
                { depth: 1 },
              ),
              api.getKnowledgeNodeProvenance(workspaceResult.organisationId, id, entityId, user),
            ]),
            8_000,
          );
          if (cancelledRef.current) return;
          const nodeById = new Map(neighbourhood.nodes.map((n) => [n.id, n]));
          const rows: RelationshipRow[] = neighbourhood.edges.map((edge) => ({
            edge,
            direction: edge.fromEntityId === entityId ? 'from' : 'to',
            otherNode: nodeById.get(
              edge.fromEntityId === entityId ? edge.toEntityId : edge.fromEntityId,
            ),
          }));
          setRelationships(rows);
          setNodeProvenance(provenance.provenance);
          setGraphUnavailable(false);
        } catch {
          if (cancelledRef.current) return;
          setRelationships(null);
          setNodeProvenance(null);
          setGraphUnavailable(true);
        }
      } catch (caught) {
        if (cancelledRef.current) return;
        if (caught instanceof ApiError && caught.status === 404) {
          setNotFound404(true);
        } else {
          setError(caught instanceof ApiError ? caught.message : 'Something went wrong.');
        }
      } finally {
        if (!cancelledRef.current) setLoading(false);
      }
    },
    [id, entityId, user],
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
  const canSteward = role !== null && STEWARD_ROLES.has(role);

  const addAlias = async () => {
    if (workspace === null) return;
    setAddingAlias(true);
    setAliasError(null);
    try {
      const created = await api.addKnowledgeEntityAlias(
        workspace.organisationId,
        id,
        entityId,
        { aliasText },
        user,
      );
      setAliases((prev) => [...prev, created]);
      setAliasText('');
    } catch (caught) {
      setAliasError(caught instanceof ApiError ? caught.message : 'Something went wrong.');
    } finally {
      setAddingAlias(false);
    }
  };

  const inspectRelationship = async (relationshipId: string) => {
    if (workspace === null) return;
    setInspecting(relationshipId);
    setInspectionResult(null);
    setInspectionError(null);
    try {
      const result = await api.getKnowledgeEdgeProvenance(
        workspace.organisationId,
        id,
        relationshipId,
        user,
      );
      setInspectionResult(result.provenance);
    } catch (caught) {
      setInspectionError(caught instanceof ApiError ? caught.message : 'Something went wrong.');
    }
  };

  if (loading) {
    return (
      <p role="status" className="text-[var(--color-ink-muted)]">
        Loading…
      </p>
    );
  }

  if (notFound404 || workspace === null || entity === null) {
    return (
      <div className="space-y-4">
        <ErrorNotice message={error ?? 'This concept could not be found.'} />
        <Link href={`/workspaces/${id}/knowledge/concepts`} className="text-sm underline">
          ← Back to concepts
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link
        href={`/workspaces/${id}/knowledge/concepts`}
        className="inline-block text-sm underline"
      >
        ← Back to concepts
      </Link>

      {error !== null && <ErrorNotice message={error} />}

      <div className="max-w-2xl">
        <p className="text-sm font-medium text-[var(--color-accent)]">{workspace.name}</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">{entity.canonicalLabel}</h1>
        <p className="mt-2 text-sm text-[var(--color-ink-muted)]">
          {entity.entityType}
          {entity.topicScheme ? ` · ${entity.topicScheme.replace(/_/g, ' ')}` : ''} · sensitivity:{' '}
          {entity.sensitivityClass} · status: {entity.status}
        </p>
        {entity.status === 'merged' && (
          <p className="mt-2 text-sm text-amber-700 dark:text-amber-400">
            This concept was merged into another one and is kept only for history.{' '}
            {entity.mergedIntoId && (
              <Link
                href={`/workspaces/${id}/knowledge/concepts/${entity.mergedIntoId}`}
                className="underline"
              >
                View the surviving concept →
              </Link>
            )}
          </p>
        )}
      </div>

      <ProgramNav workspaceId={id} role={role} />
      <KnowledgeNav workspaceId={id} role={role} />

      {entity.definition !== null && (
        <section aria-labelledby="definition-heading" className="space-y-2">
          <h2 id="definition-heading" className="text-lg font-semibold">
            Definition
          </h2>
          <Card>
            <p className="whitespace-pre-wrap text-sm">{entity.definition}</p>
          </Card>
        </section>
      )}

      <section aria-labelledby="aliases-heading" className="space-y-3">
        <h2 id="aliases-heading" className="text-lg font-semibold">
          Also known as
        </h2>
        {aliases.length === 0 ? (
          <p className="text-sm text-[var(--color-ink-muted)]">
            No alternate names recorded — the community's own words for this concept, once added,
            appear here rather than being normalised away.
          </p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {aliases.map((alias) => (
              <li
                key={alias.id}
                className="rounded-full border border-[var(--color-line)] px-3 py-1 text-sm"
                title={`Added by ${alias.contributedByName}`}
              >
                {alias.aliasText}
                {alias.language ? ` (${alias.language})` : ''}
              </li>
            ))}
          </ul>
        )}
        {canPropose && (
          <div className="flex max-w-md gap-2">
            <input
              type="text"
              value={aliasText}
              onChange={(event) => setAliasText(event.target.value)}
              placeholder="Add an alias, e.g. a name used in the community"
              maxLength={300}
              className="flex-1 rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2 text-sm"
            />
            <Button
              variant="secondary"
              disabled={addingAlias || aliasText.trim() === ''}
              onClick={() => void addAlias()}
            >
              Add
            </Button>
          </div>
        )}
        {aliasError !== null && <ErrorNotice message={aliasError} />}
      </section>

      <section aria-labelledby="relationships-heading" className="space-y-3">
        <h2 id="relationships-heading" className="text-lg font-semibold">
          Relationships
        </h2>
        {graphUnavailable ? (
          <Card>
            <p className="text-sm text-[var(--color-ink-muted)]">
              The connection graph isn't available right now. PostgreSQL remains the source of truth
              for everything above — this section only reflects the rebuildable graph projection.
            </p>
          </Card>
        ) : relationships === null || relationships.length === 0 ? (
          <p className="text-sm text-[var(--color-ink-muted)]">No confirmed relationships yet.</p>
        ) : (
          <ul className="space-y-2">
            {relationships.map((row) => (
              <li key={row.edge.id}>
                <Card className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm">
                      <span className="font-medium">{entity.canonicalLabel}</span>{' '}
                      <span className="text-[var(--color-ink-muted)]">
                        {row.direction === 'from'
                          ? row.edge.relationshipType
                          : `${row.edge.relationshipType} (inverse)`}
                      </span>{' '}
                      {row.otherNode ? (
                        <Link
                          href={`/workspaces/${id}/knowledge/concepts/${row.otherNode.id}`}
                          className="font-medium underline"
                        >
                          {row.otherNode.canonicalLabel}
                        </Link>
                      ) : (
                        <span className="text-[var(--color-ink-muted)]">(concept not visible)</span>
                      )}
                    </p>
                    <Button
                      variant="secondary"
                      onClick={() => void inspectRelationship(row.edge.id)}
                    >
                      Why is this here?
                    </Button>
                  </div>
                  {row.edge.perspectiveTags !== null && row.edge.perspectiveTags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {row.edge.perspectiveTags.map((tag) => (
                        <PerspectiveTagBadge key={tag} tag={tag} />
                      ))}
                    </div>
                  )}
                  {inspecting === row.edge.id && (
                    <div className="rounded border border-[var(--color-line)] bg-[var(--color-paper)] p-3 text-sm">
                      {inspectionError !== null ? (
                        <ErrorNotice message={inspectionError} />
                      ) : inspectionResult === null ? (
                        <p className="text-[var(--color-ink-muted)]">Loading…</p>
                      ) : inspectionResult.length === 0 ? (
                        <p className="text-[var(--color-ink-muted)]">No provenance found.</p>
                      ) : (
                        <ul className="space-y-2">
                          {inspectionResult.map((rec) => (
                            <li key={rec.provenanceChainId}>
                              <p>
                                Confirmed by <strong>{rec.confirmedByDisplayName}</strong> on{' '}
                                {new Date(rec.confirmedAt).toLocaleDateString()} from{' '}
                                {rec.sourceEvidenceIds.length} evidence item
                                {rec.sourceEvidenceIds.length === 1 ? '' : 's'}.
                              </p>
                              <p className="text-[var(--color-ink-muted)]">
                                Extraction: {rec.extractionMethod} · Confidence:{' '}
                                {Math.round(rec.confidence * 100)}% · Lifecycle:{' '}
                                {rec.lifecycleState}
                              </p>
                              {rec.perspectiveTags.length > 0 && (
                                <div className="mt-1 flex flex-wrap gap-1">
                                  {rec.perspectiveTags.map((tag) => (
                                    <PerspectiveTagBadge key={tag} tag={tag} />
                                  ))}
                                </div>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="history-heading" className="space-y-3">
        <h2 id="history-heading" className="text-lg font-semibold">
          History &amp; disagreement
        </h2>
        {graphUnavailable ? (
          <p className="text-sm text-[var(--color-ink-muted)]">Not available right now.</p>
        ) : nodeProvenance === null || nodeProvenance.length === 0 ? (
          <p className="text-sm text-[var(--color-ink-muted)]">
            No confirmed attributes yet — nothing has been asserted about this concept beyond its
            existence.
          </p>
        ) : (
          <ul className="space-y-2">
            {nodeProvenance.map((rec) => (
              <li key={rec.provenanceChainId}>
                <Card className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm">
                    Confirmed by <strong>{rec.confirmedByDisplayName}</strong> on{' '}
                    {new Date(rec.confirmedAt).toLocaleDateString()}
                  </p>
                  {rec.perspectiveTags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {rec.perspectiveTags.map((tag) => (
                        <PerspectiveTagBadge key={tag} tag={tag} />
                      ))}
                    </div>
                  )}
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      {canSteward && (
        <section aria-labelledby="steward-heading" className="space-y-2">
          <h2 id="steward-heading" className="text-lg font-semibold">
            Steward tools
          </h2>
          <Card>
            <p className="text-sm text-[var(--color-ink-muted)]">
              To merge this concept with a duplicate, use the Stewardship workspace, which shows a
              preview of what will change before anything is written.
            </p>
            <Link
              href={`/workspaces/${id}/knowledge/stewardship?entityId=${entity.id}`}
              className="mt-2 inline-block text-sm underline"
            >
              Open Stewardship →
            </Link>
          </Card>
        </section>
      )}
    </div>
  );
}
