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
  title: 'Evidence & provenance — Witness',
  description:
    'How something said, observed, proposed or objected to during a session becomes structured, sourced evidence in Witness - and why every record traces to a source, a time and a named actor.',
  path: '/platform/evidence',
});

const facts = [
  [
    'Structured, not free text',
    'Evidence is a single, structured thing someone said, observed, proposed or objected to - not ' +
      'a paragraph buried in a transcript someone has to re-read to find it again.',
  ],
  [
    'Draft, submitted or withdrawn',
    'A piece of evidence can be drafted, then submitted. A submitted piece can still be withdrawn. ' +
      'Nothing is silently edited into something it never was.',
  ],
  [
    'Linked, not isolated',
    'Evidence links to other evidence within a session, with its own actor and audit trail - so a ' +
      'mistaken link can be removed without treating a piece of testimony the same way.',
  ],
  [
    'Consent decides what can exist',
    'Whether a contribution can be recorded, quoted or identified is decided per participant, per ' +
      'category, against a versioned consent template, before capture - not applied afterward as a ' +
      'redaction pass.',
  ],
] as const;

export default function EvidencePage() {
  const { demoUrl } = marketingSiteConfig();

  return (
    <div className="foundation-page">
      <div className="foundation-heading">
        <Eyebrow>Platform</Eyebrow>
        <h1>Provenance or it did not happen.</h1>
        <p className="promise">
          Every institutional record traces back to a source, captured at a time, by a named actor.
          There is no path that produces a record without that chain attached.
        </p>
      </div>

      <Section id="facts" className="homepage-section">
        <SectionHeading title="What evidence actually is in Witness" />
        <div className="feature-grid audience-grid">
          {facts.map(([title, description]) => (
            <FeatureCard key={title} title={title}>
              <p>{description}</p>
            </FeatureCard>
          ))}
        </div>
      </Section>

      <Section id="chain" className="homepage-section">
        <EvidenceRelationshipDiagram
          title="Illustrative evidence chain"
          description="A synthetic example of how one piece of evidence connects forward toward a decision."
        >
          <div>
            <Badge>Illustrative example</Badge>
          </div>
          <LinearProvenanceChain
            label="Illustrative evidence to decision relationship"
            steps={[
              { kind: 'contributor', label: 'Contributor', detail: 'Session participant' },
              { kind: 'evidence', label: 'Evidence', detail: 'Submitted' },
              { kind: 'finding', label: 'Finding' },
              { kind: 'recommendation', label: 'Recommendation' },
              { kind: 'decision', label: 'Decision', detail: 'Confirmed' },
            ]}
          />
        </EvidenceRelationshipDiagram>
      </Section>

      <Section id="contact" className="homepage-section homepage-final-cta">
        <SectionHeading title="See how a real session's evidence stays connected." />
        <CTAGroup aria-label="Evidence page actions">
          <LinkButton href={demoUrl.href}>Book a demonstration</LinkButton>
          <LinkButton href="/platform/decisions" variant="secondary">
            Decisions & actions
          </LinkButton>
          <LinkButton href="/platform" variant="tertiary">
            Explore the platform
          </LinkButton>
        </CTAGroup>
      </Section>
    </div>
  );
}
