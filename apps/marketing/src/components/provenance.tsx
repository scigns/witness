import type { ReactNode } from 'react';

export type ProvenanceKind =
  | 'source'
  | 'contributor'
  | 'contribution'
  | 'evidence'
  | 'finding'
  | 'recommendation'
  | 'decision'
  | 'action'
  | 'outcome';

export interface ProvenanceStep {
  kind: ProvenanceKind;
  label: string;
  detail?: string;
}

export function ProvenanceNode({ kind, label, detail }: ProvenanceStep) {
  return (
    <div className={`provenance-node provenance-node-${kind}`}>
      <span className="provenance-kind">{kind}</span>
      <strong>{label}</strong>
      {detail === undefined ? null : <small>{detail}</small>}
    </div>
  );
}

export function ProvenanceConnector({ label = 'leads to' }: { label?: string }) {
  return (
    <span className="provenance-connector">
      <span aria-hidden="true">→</span>
      <span className="visually-hidden">{label}</span>
    </span>
  );
}

export function LinearProvenanceChain({
  steps,
  label,
}: {
  steps: ProvenanceStep[];
  label: string;
}) {
  return (
    <figure className="provenance-figure">
      <figcaption className="visually-hidden">{label}</figcaption>
      <ol className="provenance-chain" aria-label={label}>
        {steps.map((step, index) => (
          <li key={`${step.kind}-${step.label}`}>
            <ProvenanceNode {...step} />
            {index === steps.length - 1 ? null : <ProvenanceConnector />}
          </li>
        ))}
      </ol>
    </figure>
  );
}

export function BranchingProvenanceChain({
  sources,
  steps,
  label,
}: {
  sources: ProvenanceStep[];
  steps: ProvenanceStep[];
  label: string;
}) {
  return (
    <figure className="provenance-figure provenance-branching">
      <figcaption className="visually-hidden">{label}</figcaption>
      <div className="provenance-sources" aria-label="Sources">
        {sources.map((source) => (
          <ProvenanceNode key={`${source.kind}-${source.label}`} {...source} />
        ))}
      </div>
      <ProvenanceConnector label="sources become" />
      <ol className="provenance-chain" aria-label="Traceable record">
        {steps.map((step, index) => (
          <li key={`${step.kind}-${step.label}`}>
            <ProvenanceNode {...step} />
            {index === steps.length - 1 ? null : <ProvenanceConnector />}
          </li>
        ))}
      </ol>
    </figure>
  );
}

export function EvidenceRelationshipDiagram({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="evidence-relationship" aria-label={title}>
      <div className="evidence-relationship-description">
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
      {children}
    </section>
  );
}
