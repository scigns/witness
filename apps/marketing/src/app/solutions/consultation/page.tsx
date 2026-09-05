import {
  CTAGroup,
  Eyebrow,
  FeatureCard,
  LinkButton,
  Section,
  SectionHeading,
} from '../../../components/marketing-primitives';
import { createMarketingMetadata } from '../../../lib/metadata';
import { marketingSiteConfig } from '../../../lib/site-config';

export const metadata = createMarketingMetadata({
  title: 'Consultation & co-design — Witness',
  description:
    'Create a clearer path from participation to findings, recommendations and institutional decisions - so a participant can see exactly how their contribution influenced the outcome.',
  path: '/solutions/consultation',
});

const facts = [
  [
    'Built around the co-design session itself',
    'Witness runs against the actual open session with its participants - not a transcript uploaded ' +
      'after the fact with the context already gone.',
  ],
  [
    'Consent is decided per participant, per category',
    'Whether a contribution can be recorded, quoted or identified is decided before capture, against ' +
      'a versioned consent template - not applied afterward as a redaction pass, and never assumed.',
  ],
  [
    'A contribution stays connected to what it produced',
    'What someone said links forward through findings and recommendations to the decision it ' +
      'informed - the specific path a participant needs to see their own influence on the outcome.',
  ],
  [
    'Nobody is asked the same question twice for nothing',
    'When a contribution can be traced to what it produced, a follow-up consultation can show people ' +
      'what changed because they spoke, instead of asking the same questions with no visible result.',
  ],
] as const;

export default function ConsultationSolutionPage() {
  const { demoUrl } = marketingSiteConfig();

  return (
    <div className="foundation-page">
      <div className="foundation-heading">
        <Eyebrow>Consultation & co-design</Eyebrow>
        <h1>Show participants how their contribution influenced the outcome.</h1>
        <p className="promise">
          Create a clearer path from participation to findings, recommendations and institutional
          decisions.
        </p>
      </div>

      <Section id="facts" className="homepage-section">
        <SectionHeading title="What this looks like in practice" />
        <div className="feature-grid audience-grid">
          {facts.map(([title, description]) => (
            <FeatureCard key={title} title={title}>
              <p>{description}</p>
            </FeatureCard>
          ))}
        </div>
      </Section>

      <Section id="contact" className="homepage-section homepage-final-cta">
        <SectionHeading title="See what a session's contributions look like traced to a decision." />
        <CTAGroup aria-label="Consultation solution page actions">
          <LinkButton href={demoUrl.href}>Book a demonstration</LinkButton>
          <LinkButton href="/how-it-works" variant="secondary">
            How Witness works
          </LinkButton>
          <LinkButton href="/platform" variant="tertiary">
            Explore Witness
          </LinkButton>
        </CTAGroup>
      </Section>
    </div>
  );
}
