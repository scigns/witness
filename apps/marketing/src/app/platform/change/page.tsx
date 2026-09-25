import {
  Badge,
  CTAGroup,
  Eyebrow,
  FeatureCard,
  LinkButton,
  Section,
  SectionHeading,
} from '../../../components/marketing-primitives';
import { EvidenceRelationshipDiagram, LinearProvenanceChain } from '../../../components/provenance';
import { createMarketingMetadata } from '../../../lib/metadata';
import { marketingSiteConfig } from '../../../lib/site-config';

export const metadata = createMarketingMetadata({
  title: 'Change over time — Witness',
  description:
    'Witness is not only a record of one consultation. It carries what an organisation learned across many workshops, what it decided, and whether that decision actually held.',
  path: '/platform/change',
});

const facts = [
  [
    'A programme is more than one session',
    'A workspace holds every session run inside a programme - not as separate files, but as one ' +
      'accumulating record a facilitator or steward can read across.',
  ],
  [
    'A summary cites the sessions it came from',
    "Each session gets its own summary, drafted from that session's confirmed evidence and citing " +
      'exactly which pieces produced it - so a later reader can see what changed between one ' +
      'workshop and the next, not just what the latest one said.',
  ],
  [
    'A decision can be revisited honestly',
    'A confirmed decision can later be superseded by a better one, or reversed outright with a ' +
      'stated reason. Both keep pointing at what came before - a changed mind is recorded, not ' +
      'hidden.',
  ],
  [
    'A closed record can be reopened',
    'If new evidence changes what a confirmed record means, it can be reopened rather than left to ' +
      'quietly disagree with what actually happened next.',
  ],
  [
    'Commitments carry progress, not a single checkbox',
    'An action tied to a commitment can move from in progress to blocked and back, with a note each ' +
      'time - so "what happened next" has an actual trail, not just a final status.',
  ],
] as const;

export default function ChangePage() {
  const { demoUrl } = marketingSiteConfig();

  return (
    <div className="foundation-page change-page">
      <div className="foundation-heading">
        <Eyebrow>Platform</Eyebrow>
        <h1>Institutional learning, not a one-off consultation.</h1>
        <p className="promise">
          Most consultation tools forget everything the moment the report is filed. Witness is built
          around the opposite assumption: that what an organisation learns in workshop one should
          still be legible in workshop five, and provable six months after the decision.
        </p>
      </div>

      <Section id="arc" className="homepage-section">
        <EvidenceRelationshipDiagram
          title="One programme, read across time"
          description="A synthetic example of how understanding, a decision and its outcome connect across separate workshops."
        >
          <div>
            <Badge>Illustrative example</Badge>
          </div>
          <LinearProvenanceChain
            label="From an early workshop to a traced outcome"
            steps={[
              { kind: 'contribution', label: 'Workshop 1', detail: '"We need X"' },
              { kind: 'finding', label: 'Workshop 3', detail: '"We\'ve learned Y"' },
              { kind: 'decision', label: 'Decision', detail: '"We will change Z"' },
              { kind: 'outcome', label: 'Six months later', detail: 'What actually happened' },
            ]}
          />
        </EvidenceRelationshipDiagram>
      </Section>

      <Section id="facts" className="homepage-section">
        <SectionHeading title="What carries the record from one workshop to the next" />
        <div className="feature-grid audience-grid">
          {facts.map(([title, description]) => (
            <FeatureCard key={title} title={title}>
              <p>{description}</p>
            </FeatureCard>
          ))}
        </div>
      </Section>

      <Section id="contact" className="homepage-section homepage-final-cta">
        <SectionHeading title="See what your own programme's record would look like a year from now." />
        <CTAGroup aria-label="Change page actions">
          <LinkButton href={demoUrl.href}>Book a demonstration</LinkButton>
          <LinkButton href="/platform/institutional-memory" variant="secondary">
            Institutional memory
          </LinkButton>
          <LinkButton href="/platform" variant="tertiary">
            Explore the platform
          </LinkButton>
        </CTAGroup>
      </Section>
    </div>
  );
}
