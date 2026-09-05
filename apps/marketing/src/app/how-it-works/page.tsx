import {
  CTAGroup,
  Eyebrow,
  FeatureCard,
  LinkButton,
  Section,
  SectionHeading,
} from '../../components/marketing-primitives';
import { BranchingProvenanceChain } from '../../components/provenance';
import { createMarketingMetadata } from '../../lib/metadata';
import { marketingSiteConfig } from '../../lib/site-config';

export const metadata = createMarketingMetadata({
  title: 'How Witness works — Witness',
  description:
    'From an open co-design session to a traceable institutional record: how evidence, findings, decisions and actions stay connected in Witness.',
  path: '/how-it-works',
});

const steps = [
  [
    '1. Work happens in the open',
    'A co-design session runs with its participants. What gets recorded, quoted or identified is ' +
      'decided per participant, per category, against a versioned consent template - before ' +
      'anything is captured.',
  ],
  [
    '2. Evidence is captured',
    'Something said, observed, proposed or objected to becomes a structured piece of evidence: ' +
      'drafted, then submitted, with the actor, session and time attached. A submitted piece can ' +
      'still be withdrawn - the record stays honest about what changed, rather than editing it away.',
  ],
  [
    '3. The recording becomes text',
    "A session's audio is transcribed. The model's output is never overwritten - a human " +
      'correction lives in a separate field, so neither version is lost. Editing stops once the ' +
      'transcript is confirmed.',
  ],
  [
    '4. Contributions stay connected',
    'Evidence links to other evidence. An AI-drafted session summary cites exactly which evidence ' +
      'it was built from, for later citation - a summary that cannot point back to its sources is ' +
      'not evidence, it is a claim.',
  ],
  [
    '5. Decisions are recorded, not just made',
    'A decision has to rest on something: a specific piece of validated evidence, or a stated ' +
      'institutional judgement with a reason attached. It moves from proposed to confirmed, then, ' +
      'if things change, to superseded or reversed - never quietly rewritten.',
  ],
  [
    '6. Actions can be traced back',
    'A commitment names who undertook it - a person, or a team that has no login of its own - and ' +
      'by when. An action carries a progress note and a percent complete, and can go from ' +
      'in progress to blocked and back, so the path stays visible instead of disappearing.',
  ],
] as const;

export default function HowItWorksPage() {
  const { demoUrl } = marketingSiteConfig();

  return (
    <div className="foundation-page">
      <div className="foundation-heading">
        <Eyebrow>How Witness works</Eyebrow>
        <h1>Connect the record from source to action.</h1>
        <p className="promise">
          Nothing in this path is a single feature bolted onto a database. Each step exists because
          the step before it is not enough on its own.
        </p>
      </div>

      <Section id="flow" className="homepage-section">
        <SectionHeading title="Sources through evidence, decisions and actions" />
        <BranchingProvenanceChain
          label="Sources through evidence, findings, recommendations, decisions and actions"
          sources={[
            { kind: 'source', label: 'Meetings' },
            { kind: 'source', label: 'Documents' },
            { kind: 'source', label: 'Surveys' },
            { kind: 'source', label: 'Research' },
            { kind: 'source', label: 'Consultation' },
          ]}
          steps={[
            { kind: 'evidence', label: 'Evidence' },
            { kind: 'finding', label: 'Finding' },
            { kind: 'recommendation', label: 'Recommendation' },
            { kind: 'decision', label: 'Decision' },
            { kind: 'action', label: 'Action' },
          ]}
        />
      </Section>

      <Section id="steps" className="homepage-section">
        <SectionHeading title="Six steps, in order" />
        <div className="feature-grid audience-grid">
          {steps.map(([title, description]) => (
            <FeatureCard key={title} title={title}>
              <p>{description}</p>
            </FeatureCard>
          ))}
        </div>
      </Section>

      <Section id="contact" className="homepage-section homepage-final-cta">
        <SectionHeading title="See it against a session that actually happened in your organisation." />
        <CTAGroup aria-label="How it works page actions">
          <LinkButton href={demoUrl.href}>Book a demonstration</LinkButton>
          <LinkButton href="/platform" variant="secondary">
            Explore the platform
          </LinkButton>
        </CTAGroup>
      </Section>
    </div>
  );
}
