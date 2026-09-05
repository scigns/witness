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
  title: 'Research — Witness',
  description:
    'Preserve how research evidence contributes to recommendations, policy and programme decisions - with an explicit, citable basis for every one.',
  path: '/solutions/research',
});

const facts = [
  [
    'Every recommendation traces back to its evidence',
    'Evidence connects forward through findings and recommendations to the decision it informed - ' +
      'the chain a citation actually needs, not a summary that has already lost the sources it drew ' +
      'on.',
  ],
  [
    'Two admissible bases, and the distinction is explicit',
    'A decision rests on either validated evidence - something a reviewer examined - or a stated ' +
      'institutional synthesis, with a mandatory rationale. Which one, and why, is recorded, not left ' +
      'implicit.',
  ],
  [
    'Summaries cite what they were built from',
    'A session summary is drafted from confirmed evidence and records exactly which pieces it came ' +
      'from - a summary that cannot point back to its sources cannot be cited later.',
  ],
  [
    'A correction never erases the original',
    "Editing a transcript keeps the model's original output alongside the human correction. Neither " +
      'version is lost, which matters when the original wording is itself part of the evidence.',
  ],
] as const;

export default function ResearchSolutionPage() {
  const { demoUrl } = marketingSiteConfig();

  return (
    <div className="foundation-page">
      <div className="foundation-heading">
        <Eyebrow>Research</Eyebrow>
        <h1>Maintain the connection between evidence, interpretation and impact.</h1>
        <p className="promise">
          Preserve how research evidence contributes to recommendations, policy and programme
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
        <SectionHeading title="See what a citable evidence chain looks like end to end." />
        <CTAGroup aria-label="Research solution page actions">
          <LinkButton href={demoUrl.href}>Book a demonstration</LinkButton>
          <LinkButton href="/platform/evidence" variant="secondary">
            Evidence & provenance
          </LinkButton>
          <LinkButton href="/platform" variant="tertiary">
            Explore Witness
          </LinkButton>
        </CTAGroup>
      </Section>
    </div>
  );
}
