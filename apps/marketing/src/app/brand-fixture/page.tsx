import type { Metadata } from 'next';

import {
  BranchingProvenanceChain,
  EvidenceRelationshipDiagram,
  LinearProvenanceChain,
} from '../../components/provenance';

export const metadata: Metadata = {
  title: 'Brand fixture | Witness',
  robots: { index: false, follow: false },
};

/** Unlinked, noindex fixture for repository-owned responsive brand QA. */
export default function BrandFixturePage() {
  return (
    <div className="section">
      <h1>Witness brand fixture</h1>
      <EvidenceRelationshipDiagram
        title="Evidence relationship fixture"
        description="Test-only synthetic relationships for responsive verification."
      >
        <LinearProvenanceChain
          label="Linear provenance fixture"
          steps={[
            { kind: 'contributor', label: 'Contributor' },
            { kind: 'contribution', label: 'Contribution' },
            { kind: 'evidence', label: 'Evidence' },
            { kind: 'finding', label: 'Finding' },
            { kind: 'recommendation', label: 'Recommendation' },
            { kind: 'decision', label: 'Decision' },
            { kind: 'action', label: 'Action' },
            { kind: 'outcome', label: 'Outcome' },
          ]}
        />
        <BranchingProvenanceChain
          label="Branching provenance fixture"
          sources={[
            { kind: 'source', label: 'Meeting' },
            { kind: 'source', label: 'Survey' },
            { kind: 'source', label: 'Workshop' },
          ]}
          steps={[
            { kind: 'evidence', label: 'Evidence' },
            { kind: 'finding', label: 'Finding' },
            { kind: 'decision', label: 'Decision' },
          ]}
        />
      </EvidenceRelationshipDiagram>
    </div>
  );
}
