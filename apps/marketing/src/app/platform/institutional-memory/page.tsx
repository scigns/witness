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
  title: 'Institutional memory — Witness',
  description:
    'Witness records assume a future stranger will read them. Nothing is deleted or silently rewritten to make the record tidier - it is kept so people who were not in the room can still trust it.',
  path: '/platform/institutional-memory',
});

const facts = [
  [
    'Summaries cite their sources',
    'A session summary is AI-drafted from confirmed evidence, but it records exactly which pieces ' +
      'of evidence it came from - a summary that cannot point back to its sources cannot be cited ' +
      'later.',
  ],
  [
    'History is kept, not overwritten',
    'A superseded decision keeps pointing at what replaced it. A reversed one keeps its reversal ' +
      "reason. Correcting a transcript keeps the model's original output alongside the human edit - " +
      'neither version is lost.',
  ],
  [
    'Consent decisions are never edited',
    'Amending what someone consented to creates a new, versioned record and marks the old one ' +
      'superseded - it does not rewrite it. What a participant actually agreed to at the time stays ' +
      'exactly as captured, permanently.',
  ],
  [
    'Built for the people who were not there',
    'A record that only makes sense to the person who wrote it is not institutional memory - it is ' +
      'a personal note. Every record here assumes its reader is a future stranger: a new hire, a ' +
      'successor, an auditor, a court.',
  ],
] as const;

export default function InstitutionalMemoryPage() {
  const { demoUrl } = marketingSiteConfig();

  return (
    <div className="foundation-page">
      <div className="foundation-heading">
        <Eyebrow>Platform</Eyebrow>
        <h1>Built to be read later.</h1>
        <p className="promise">
          Staff leave. Consultants finish their contracts. Governments change. What a decision
          rested on should not leave with any of them.
        </p>
      </div>

      <Section id="facts" className="homepage-section">
        <SectionHeading title="What keeps a record trustworthy years later" />
        <div className="feature-grid audience-grid">
          {facts.map(([title, description]) => (
            <FeatureCard key={title} title={title}>
              <p>{description}</p>
            </FeatureCard>
          ))}
        </div>
      </Section>

      <Section id="pull-quote" className="homepage-section">
        <p className="pacific-line">Clarity now is kindness then.</p>
      </Section>

      <Section id="contact" className="homepage-section homepage-final-cta">
        <SectionHeading title="See what your organisation's record would look like five years from now." />
        <CTAGroup aria-label="Institutional memory page actions">
          <LinkButton href={demoUrl.href}>Book a demonstration</LinkButton>
          <LinkButton href="/platform/evidence" variant="secondary">
            Evidence & provenance
          </LinkButton>
          <LinkButton href="/platform" variant="tertiary">
            Explore the platform
          </LinkButton>
        </CTAGroup>
      </Section>
    </div>
  );
}
