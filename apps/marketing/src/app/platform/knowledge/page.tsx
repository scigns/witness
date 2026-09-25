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
  title: 'Knowledge — Witness',
  description:
    'How Witness makes visible the way ideas, evidence, disagreement and decisions relate to each other - and lets anyone trace a relationship back to the evidence it came from.',
  path: '/platform/knowledge',
});

const facts = [
  [
    'A quote becomes a concept, not just a record',
    'Evidence can be linked into concepts and relationships that persist across sessions - so ' +
      '"three people, in two workshops, raised the same concern" is something Witness can show, ' +
      'not something a facilitator has to remember.',
  ],
  [
    'Disagreement has a name, not a footnote',
    'A claim can be tagged contested, a minority perspective, culturally significant, unresolved, ' +
      'or community-restricted - at the same time. None of those tags average the disagreement ' +
      'away into a single official reading.',
  ],
  [
    '“Group A supports, Group B opposes” stays two readings',
    'A perspective is attached to whichever community or group actually holds it. Two groups can ' +
      'hold opposite readings of the same evidence, permanently, without either being deleted to ' +
      'make room for the other.',
  ],
  [
    'A claim can be sent back before it is settled',
    'Reviewing a candidate claim is not limited to approve or reject - a Knowledge Steward can ' +
      'return it for community review, mark it qualified, or ask for clarification first.',
  ],
  [
    'Every relationship traces back to evidence',
    'A concept, a link between two concepts, or a tag on a claim all carry a provenance chain back ' +
      'to the session and the evidence that produced them - inspectable, not asserted.',
  ],
] as const;

export default function KnowledgePage() {
  const { demoUrl } = marketingSiteConfig();

  return (
    <div className="foundation-page knowledge-page">
      <div className="foundation-heading">
        <Eyebrow>Platform</Eyebrow>
        <h1>Make visible how understanding actually forms.</h1>
        <p className="promise">
          Witness helps make visible how ideas, people, evidence, disagreements, decisions and
          outcomes relate to each other - and lets you inspect why a relationship exists, back to
          the evidence it came from.
        </p>
      </div>

      <Section id="questions" className="homepage-section">
        <EvidenceRelationshipDiagram
          title="The question Witness keeps answerable"
          description="The same question, asked again as understanding moves forward."
        >
          <div>
            <Badge>Illustrative example</Badge>
          </div>
          <LinearProvenanceChain
            label="What was said, to what changed"
            steps={[
              { kind: 'contribution', label: 'What was said?' },
              { kind: 'finding', label: 'What did we understand?' },
              { kind: 'evidence', label: 'What was contested?', detail: 'Tagged, not hidden' },
              { kind: 'decision', label: 'What was decided?' },
              { kind: 'outcome', label: 'What changed?' },
            ]}
          />
        </EvidenceRelationshipDiagram>
      </Section>

      <Section id="facts" className="homepage-section">
        <SectionHeading title="What actually holds these relationships together" />
        <div className="feature-grid audience-grid">
          {facts.map(([title, description]) => (
            <FeatureCard key={title} title={title}>
              <p>{description}</p>
            </FeatureCard>
          ))}
        </div>
      </Section>

      <Section id="contact" className="homepage-section homepage-final-cta">
        <SectionHeading title="See a real disagreement held, not smoothed over." />
        <CTAGroup aria-label="Knowledge page actions">
          <LinkButton href={demoUrl.href}>Book a demonstration</LinkButton>
          <LinkButton href="/platform/change" variant="secondary">
            How change is traced
          </LinkButton>
          <LinkButton href="/platform" variant="tertiary">
            Explore the platform
          </LinkButton>
        </CTAGroup>
      </Section>
    </div>
  );
}
