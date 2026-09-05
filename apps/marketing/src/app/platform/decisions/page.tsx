import {
  Badge,
  CTAGroup,
  Eyebrow,
  FeatureCard,
  LinkButton,
  Section,
  SectionHeading,
  Stat,
} from '../../../components/marketing-primitives';
import { createMarketingMetadata } from '../../../lib/metadata';
import { marketingSiteConfig } from '../../../lib/site-config';

export const metadata = createMarketingMetadata({
  title: 'Decisions & actions — Witness',
  description:
    'What a Witness decision has to rest on, how a commitment is owned, and how an action is carried out and traced - not just marked done.',
  path: '/platform/decisions',
});

const decisionFacts = [
  [
    'A decision has to rest on something',
    'Confirming a decision requires support: a specific piece of validated evidence, or a stated ' +
      'institutional judgement with a reason attached. An institution that records a decision ' +
      'nobody can trace to anything has recorded a preference.',
  ],
  [
    'Superseded and reversed are different',
    'A decision moves from proposed to confirmed, then either superseded - a later decision ' +
      'replaced it, and it was right at the time - or reversed - the institution changed its mind ' +
      'and says so. Neither deletes anything.',
  ],
  [
    'Commitments can be owned by a team',
    'A commitment names a responsible party in plain language - "the housing team", "Council\'s ' +
      'transport unit" - not only a person with a login. Most commitments in a session belong to a ' +
      'role, not an individual.',
  ],
  [
    'Actions carry progress, not just a checkbox',
    'An action records a progress note and a percent complete, and can move from in progress to ' +
      'blocked and back - work that stalls and resumes is the normal case, not an exception to ' +
      'paper over.',
  ],
] as const;

export default function DecisionsPage() {
  const { demoUrl } = marketingSiteConfig();

  return (
    <div className="foundation-page">
      <div className="foundation-heading">
        <Eyebrow>Platform</Eyebrow>
        <h1>Don't just store the decision. Preserve its story.</h1>
        <p className="promise">
          A decision, a commitment and an action are three different kinds of record, each with its
          own lifecycle - because "what did we decide," "who agreed to do it" and "is it actually
          happening" are three different questions.
        </p>
      </div>

      <Section id="facts" className="homepage-section">
        <SectionHeading title="What a decision actually requires" />
        <div className="feature-grid audience-grid">
          {decisionFacts.map(([title, description]) => (
            <FeatureCard key={title} title={title}>
              <p>{description}</p>
            </FeatureCard>
          ))}
        </div>
      </Section>

      <Section id="preview" className="homepage-section">
        <SectionHeading
          eyebrow="Illustrative example"
          title="A decision, its commitment, and the action tracing it."
        />
        <div className="product-preview-detail">
          <div className="card">
            <div className="preview-record-heading">
              <p className="eyebrow eyebrow-mono">Decision</p>
              <Badge>Confirmed</Badge>
            </div>
            <h3>Adopt revised complaints process</h3>
            <p className="preview-muted">
              Rests on: validated evidence from Community consultation #14
            </p>
          </div>
          <div className="card">
            <div className="preview-record-heading">
              <p className="eyebrow eyebrow-mono">Commitment</p>
              <Badge>Active</Badge>
            </div>
            <h3>Owned by Council's complaints unit</h3>
            <Stat label="Due" value="30 days" />
          </div>
        </div>
      </Section>

      <Section id="contact" className="homepage-section homepage-final-cta">
        <SectionHeading title="See what a decision in your own organisation would rest on." />
        <CTAGroup aria-label="Decisions page actions">
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
