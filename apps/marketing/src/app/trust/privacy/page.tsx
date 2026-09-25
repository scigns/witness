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
  title: 'Privacy — Witness',
  description:
    'What a participant actually consents to in Witness, per category, before anything is captured - and what happens to that consent record afterward.',
  path: '/trust/privacy',
});

const facts = [
  [
    'Consent is decided per category, not once for everything',
    'Being recorded, being quoted attributed to a name, being quoted anonymously, having a photo ' +
      'taken - each is its own decision against a versioned template, before capture, not a single ' +
      'blanket checkbox.',
  ],
  [
    'Fail-closed, not fail-open',
    'If a required category was never decided, the action it protects is refused. A missing consent ' +
      'record is not treated as an implicit yes.',
  ],
  [
    'Withdrawing consent creates a new record, it does not erase the old one',
    'Changing what someone agreed to supersedes the previous record rather than editing it in place. ' +
      'What was actually agreed at the time stays exactly as captured - including that it was later ' +
      'withdrawn.',
  ],
  [
    'Anonymous and pseudonymous participation are real options',
    'A session can be configured so a participant contributes without ever giving a name, or under a ' +
      'name chosen at the door rather than a verified identity.',
  ],
  [
    'Public analytics never see evidence',
    'Measurement on the public website is first-party and minimal, and never includes evidence, ' +
      'decision, or session content of any kind.',
  ],
] as const;

export default function PrivacyPage() {
  const { demoUrl } = marketingSiteConfig();

  return (
    <div className="foundation-page privacy-page">
      <div className="foundation-heading">
        <Eyebrow>Trust</Eyebrow>
        <h1>Consent decides what can exist, before capture.</h1>
        <p className="promise">
          Whether a contribution can be recorded, quoted, or identified is decided per participant,
          per category, against a versioned consent template - not applied afterward as a redaction
          pass.
        </p>
      </div>

      <Section id="facts" className="homepage-section">
        <SectionHeading title="What actually happens to a participant's consent" />
        <div className="feature-grid audience-grid">
          {facts.map(([title, description]) => (
            <FeatureCard key={title} title={title}>
              <p>{description}</p>
            </FeatureCard>
          ))}
        </div>
      </Section>

      <Section id="contact" className="homepage-section homepage-final-cta">
        <SectionHeading title="Ask what a participant in your next session would actually see." />
        <CTAGroup aria-label="Privacy page actions">
          <LinkButton href={demoUrl.href}>Book a demonstration</LinkButton>
          <LinkButton href="/platform/co-design" variant="secondary">
            Co-design
          </LinkButton>
          <LinkButton href="/trust" variant="tertiary">
            Trust overview
          </LinkButton>
        </CTAGroup>
      </Section>
    </div>
  );
}
