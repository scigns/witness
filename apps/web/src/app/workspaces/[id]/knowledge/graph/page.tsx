'use client';

/**
 * Graph Explorer (3J) — the last Knowledge tab, deliberately (KnowledgeNav
 * never makes this the default route). Cytoscape.js renders the canvas; an
 * accessible table underneath shows the identical nodes and edges as text,
 * because a canvas has no accessibility tree of its own.
 *
 * State is distinguished by shape, border style and an explicit icon/label —
 * never colour alone (WCAG 1.4.1): `merged`/`superseded` concepts render
 * dashed and slightly translucent with a status label; `confidential`/
 * `restricted` concepts carry a 🔒 read as "restricted" by screen readers;
 * a relationship past its `validTo` renders as a dashed edge labelled
 * "(historical)".
 *
 * The projection itself (`GraphNode`/`GraphEdge`, `services/knowledge-graph`)
 * does not carry perspective tags (contested/minority-perspective/etc.) —
 * only the underlying `KnowledgeAssertion` does. Rather than fake a visual
 * that isn't backed by the data, disagreement is surfaced the same way the
 * concept detail page does it: click an edge to open its actual provenance,
 * which does carry perspective tags. Documented here rather than silently
 * worked around — see this feature's closing report.
 */

import cytoscape, { type Core, type ElementDefinition } from 'cytoscape';
import Link from 'next/link';
import { use, useCallback, useEffect, useRef, useState } from 'react';

import type { GraphEdge, GraphNode, ProvenanceRecord, WorkspaceSummary } from '@witness/contracts';

import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useSession } from '@/lib/session';
import { ProgramNav } from '@/components/program-nav';
import { KnowledgeNav } from '@/components/knowledge-nav';
import { Button, Card, ErrorNotice } from '@/components/ui';

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);
}

const ENTITY_SHAPES: Record<string, string> = {
  person: 'ellipse',
  community: 'round-hexagon',
  organisation: 'round-rectangle',
  project: 'round-rectangle',
  meeting: 'diamond',
  policy: 'rectangle',
  evidence: 'rectangle',
  risk: 'triangle',
  decision: 'diamond',
  action: 'vee',
  commitment: 'vee',
  location: 'star',
  topic: 'octagon',
};

const PERSPECTIVE_TAG_LABELS: Record<string, string> = {
  contested: 'Contested',
  minority_perspective: 'Minority perspective',
  culturally_significant: 'Culturally significant',
  unresolved: 'Unresolved',
  community_restricted: 'Community-restricted',
  machine_inferred: 'Machine-inferred',
};

export default function GraphExplorerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user, ready } = useSession();
  const { currentUser } = useAuth();

  const [workspace, setWorkspace] = useState<WorkspaceSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<GraphNode[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [centerId, setCenterId] = useState<string | null>(null);
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [graphError, setGraphError] = useState<string | null>(null);
  const [graphLoading, setGraphLoading] = useState(false);

  const [view, setView] = useState<'graph' | 'list'>('graph');
  const [selectedEdge, setSelectedEdge] = useState<GraphEdge | null>(null);
  const [selectedEdgeProvenance, setSelectedEdgeProvenance] = useState<ProvenanceRecord[] | null>(
    null,
  );
  const [inspectionError, setInspectionError] = useState<string | null>(null);

  const cyContainerRef = useRef<HTMLDivElement | null>(null);
  const cyRef = useRef<Core | null>(null);

  const load = useCallback(
    async (cancelledRef: { current: boolean }) => {
      try {
        const workspaceResult = await api.getWorkspace(id, user);
        if (cancelledRef.current) return;
        setWorkspace(workspaceResult);
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

  const runSearch = async () => {
    if (workspace === null || query.trim() === '') return;
    setSearching(true);
    setSearchError(null);
    try {
      const result = await withTimeout(
        api.searchKnowledgeGraph(workspace.organisationId, id, query, user),
        8_000,
      );
      setSearchResults(result.results);
    } catch (caught) {
      setSearchError(
        caught instanceof ApiError
          ? caught.message
          : 'The graph is not available right now — it may be mid-rebuild.',
      );
    } finally {
      setSearching(false);
    }
  };

  const centerOn = useCallback(
    async (entityId: string) => {
      if (workspace === null) return;
      setGraphLoading(true);
      setGraphError(null);
      setSelectedEdge(null);
      try {
        const result = await withTimeout(
          api.getKnowledgeGraphNeighbourhood(workspace.organisationId, id, entityId, user, {
            depth: 1,
          }),
          8_000,
        );
        setCenterId(entityId);
        setNodes(result.nodes);
        setEdges(result.edges);
      } catch (caught) {
        setGraphError(
          caught instanceof ApiError
            ? caught.message
            : 'The graph is not available right now — it may be mid-rebuild.',
        );
      } finally {
        setGraphLoading(false);
      }
    },
    [workspace, id, user],
  );

  const inspectEdge = async (edge: GraphEdge) => {
    if (workspace === null) return;
    setSelectedEdge(edge);
    setSelectedEdgeProvenance(null);
    setInspectionError(null);
    try {
      const result = await api.getKnowledgeEdgeProvenance(
        workspace.organisationId,
        id,
        edge.id,
        user,
      );
      setSelectedEdgeProvenance(result.provenance);
    } catch (caught) {
      setInspectionError(caught instanceof ApiError ? caught.message : 'Something went wrong.');
    }
  };

  // Cytoscape lifecycle — only ever touches the DOM inside effects.
  useEffect(() => {
    if (cyContainerRef.current === null) return;

    const elements: ElementDefinition[] = [
      ...nodes.map((node) => ({
        data: {
          id: node.id,
          label: node.canonicalLabel,
          entityType: node.entityType,
          status: node.status,
          sensitivityClass: node.sensitivityClass,
        },
      })),
      ...edges.map((edge) => ({
        data: {
          id: edge.id,
          source: edge.fromEntityId,
          target: edge.toEntityId,
          label: edge.relationshipType,
          historical: edge.validTo !== null,
        },
      })),
    ];

    const cy = cytoscape({
      container: cyContainerRef.current,
      elements,
      style: [
        {
          selector: 'node',
          style: {
            // Cytoscape's stylesheet is parsed by its own engine, not the
            // browser's CSS engine — it cannot resolve `var(...)` or
            // `oklch(...)` (the app theme tokens use both), so this is a
            // literal fallback, not a themed value.
            'background-color': '#4f7cff',
            label: 'data(label)',
            color: '#e5e7eb',
            'font-size': 10,
            'text-valign': 'bottom',
            'text-margin-y': 4,
            width: 36,
            height: 36,
            shape: (el) => (ENTITY_SHAPES[el.data('entityType') as string] ?? 'ellipse') as never,
          },
        },
        {
          selector: 'node[status = "merged"], node[status = "superseded"]',
          style: {
            'background-opacity': 0.4,
            'border-width': 2,
            'border-style': 'dashed',
            'border-color': '#f59e0b',
          },
        },
        {
          selector:
            'node[sensitivityClass = "confidential"], node[sensitivityClass = "restricted"]',
          style: {
            'border-width': 3,
            'border-color': '#dc2626',
          },
        },
        {
          selector: `node[id = "${centerId ?? ''}"]`,
          style: {
            'border-width': 4,
            'border-color': '#22c55e',
          },
        },
        {
          selector: 'edge',
          style: {
            width: 2,
            'line-color': '#6b7280',
            'target-arrow-color': '#6b7280',
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
            label: 'data(label)',
            'font-size': 8,
            color: '#9ca3af',
          },
        },
        {
          selector: 'edge[?historical]',
          style: {
            'line-style': 'dashed',
            label: 'data(label) + " (historical)"' as never,
          },
        },
      ],
      layout: { name: 'cose', animate: false },
    });

    cy.on('tap', 'node', (evt) => {
      const nodeId = evt.target.id();
      void centerOn(nodeId);
    });
    cy.on('tap', 'edge', (evt) => {
      const edgeId = evt.target.id();
      const edge = edges.find((e) => e.id === edgeId);
      if (edge !== undefined) void inspectEdge(edge);
    });

    cyRef.current = cy;
    return () => {
      cy.destroy();
      cyRef.current = null;
    };
  }, [nodes, edges, centerId, centerOn]);

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
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Graph</h1>
        <p className="mt-2 text-[var(--color-ink-muted)]">
          How concepts connect. This is a rebuildable view of PostgreSQL, not the record itself —
          click any connection to see the evidence behind it.
        </p>
      </div>

      <ProgramNav workspaceId={id} role={role} />
      <KnowledgeNav workspaceId={id} role={role} />

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => event.key === 'Enter' && void runSearch()}
          placeholder="Search for a concept to start from…"
          className="min-w-64 flex-1 rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2 text-sm"
        />
        <Button variant="secondary" disabled={searching} onClick={() => void runSearch()}>
          {searching ? 'Searching…' : 'Search'}
        </Button>
        <div className="ml-auto flex gap-1 rounded-full border border-[var(--color-line)] p-0.5 text-sm">
          <button
            type="button"
            onClick={() => setView('graph')}
            className={`rounded-full px-3 py-1 ${view === 'graph' ? 'bg-[var(--color-accent-soft)] text-[var(--color-accent)]' : ''}`}
          >
            Graph
          </button>
          <button
            type="button"
            onClick={() => setView('list')}
            className={`rounded-full px-3 py-1 ${view === 'list' ? 'bg-[var(--color-accent-soft)] text-[var(--color-accent)]' : ''}`}
          >
            List (accessible)
          </button>
        </div>
      </div>

      {searchError !== null && <ErrorNotice message={searchError} />}

      {searchResults.length > 0 && centerId === null && (
        <Card>
          <p className="mb-2 text-sm font-medium">Results</p>
          <ul className="space-y-1">
            {searchResults.map((node) => (
              <li key={node.id}>
                <button
                  type="button"
                  onClick={() => void centerOn(node.id)}
                  className="text-sm underline hover:no-underline"
                >
                  {node.canonicalLabel} ({node.entityType})
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {graphError !== null && (
        <Card>
          <p className="text-sm text-[var(--color-ink-muted)]">{graphError}</p>
        </Card>
      )}

      {graphLoading && (
        <p role="status" className="text-sm text-[var(--color-ink-muted)]">
          Loading neighbourhood…
        </p>
      )}

      {centerId !== null && !graphLoading && graphError === null && (
        <>
          {/*
           * Both views stay mounted; only visibility toggles. Cytoscape
           * mutates this container's DOM directly (it injects its own
           * canvas layers) — letting React unmount and remount the same
           * node when switching views raced React's own reconciliation
           * against Cytoscape's, throwing `removeChild: not a child of
           * this node`. Never conditionally render this div on `view`.
           */}
          <div className={view === 'graph' ? 'space-y-2' : 'hidden'}>
            <div
              ref={cyContainerRef}
              role="img"
              aria-label={`Graph centred on ${nodes.find((n) => n.id === centerId)?.canonicalLabel ?? 'a concept'}, with ${nodes.length} concepts and ${edges.length} relationships. Use the accessible list view for full detail.`}
              className="h-96 w-full rounded-lg border border-[var(--color-line)] bg-[var(--color-paper)]"
            />
            <p className="text-xs text-[var(--color-ink-muted)]">
              Legend: dashed border = merged/superseded · red border = confidential/restricted ·
              green border = the concept you're centred on · dashed edge = no longer current. Click
              a concept to re-centre; click a relationship for its evidence.
            </p>
          </div>

          <div className={view === 'list' ? 'space-y-4' : 'hidden'}>
            <div>
              <h2 className="mb-2 text-sm font-semibold">Concepts ({nodes.length})</h2>
              <ul className="space-y-1 text-sm">
                {nodes.map((node) => (
                  <li key={node.id} className="flex items-center gap-2">
                    <Link
                      href={`/workspaces/${id}/knowledge/concepts/${node.id}`}
                      className="underline"
                    >
                      {node.canonicalLabel}
                    </Link>
                    <span className="text-[var(--color-ink-muted)]">
                      {node.entityType}
                      {node.status !== 'active' ? ` · ${node.status}` : ''}
                      {(node.sensitivityClass === 'confidential' ||
                        node.sensitivityClass === 'restricted') &&
                        ' · 🔒 restricted'}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h2 className="mb-2 text-sm font-semibold">Relationships ({edges.length})</h2>
              <ul className="space-y-1 text-sm">
                {edges.map((edge) => {
                  const from = nodes.find((n) => n.id === edge.fromEntityId);
                  const to = nodes.find((n) => n.id === edge.toEntityId);
                  return (
                    <li key={edge.id}>
                      <button
                        type="button"
                        onClick={() => void inspectEdge(edge)}
                        className="underline hover:no-underline"
                      >
                        {from?.canonicalLabel ?? '?'} {edge.relationshipType}{' '}
                        {to?.canonicalLabel ?? '?'}
                      </button>
                      {edge.validTo !== null && (
                        <span className="text-[var(--color-ink-muted)]"> (historical)</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>

          {selectedEdge !== null && (
            <Card className="space-y-2 text-sm">
              <p className="font-medium">Why is this here?</p>
              {inspectionError !== null ? (
                <ErrorNotice message={inspectionError} />
              ) : selectedEdgeProvenance === null ? (
                <p className="text-[var(--color-ink-muted)]">Loading…</p>
              ) : selectedEdgeProvenance.length === 0 ? (
                <p className="text-[var(--color-ink-muted)]">No provenance found.</p>
              ) : (
                <ul className="space-y-2">
                  {selectedEdgeProvenance.map((rec) => (
                    <li key={rec.provenanceChainId}>
                      <p>
                        Confirmed by <strong>{rec.confirmedByDisplayName}</strong> on{' '}
                        {new Date(rec.confirmedAt).toLocaleDateString()} from{' '}
                        {rec.sourceEvidenceIds.length} evidence item
                        {rec.sourceEvidenceIds.length === 1 ? '' : 's'}.
                      </p>
                      {rec.perspectiveTags.length > 0 && (
                        <p className="text-amber-700 dark:text-amber-400">
                          {rec.perspectiveTags
                            .map((tag) => PERSPECTIVE_TAG_LABELS[tag] ?? tag)
                            .join(', ')}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}
        </>
      )}

      {centerId === null && searchResults.length === 0 && (
        <Card>
          <p className="text-sm text-[var(--color-ink-muted)]">
            Search for a concept above to start exploring its connections.
          </p>
        </Card>
      )}
    </div>
  );
}
