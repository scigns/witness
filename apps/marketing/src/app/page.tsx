import {
  Badge,
  Callout,
  CTAGroup,
  Eyebrow,
  FeatureCard,
  LinkButton,
  Section,
  SectionHeading,
} from '../components/marketing-primitives';
import { EvidenceRelationshipDiagram, LinearProvenanceChain } from '../components/provenance';
import { ProductPreview } from '../components/product-preview';
import { createMarketingMetadata } from '../lib/metadata';
import { marketingSiteConfig } from '../lib/site-config';

export const metadata = createMarketingMetadata({
  title: 'Witness — Build better decisions with the people affected by them',
  description:
    'Witness helps organisations run workshops, consultations and co-design processes where contributions don’t disappear into sticky notes and reports — keeping the path from what people said to what was decided and what happens next.',
  path: '/',
});

const engagementStages = [
  [
    'Before',
    [
      'Define the purpose of the work.',
      'Establish participation and consent.',
      'Prepare sessions and identify people and roles.',
      'Bring existing documents and evidence together in one place.',
    ],
  ],
  [
    'During',
    [
      'Capture contributions as they happen.',
      'Connect discussion to the evidence behind it.',
      'Identify findings as they emerge, not weeks later.',
      'Maintain context across multiple sessions.',
      'Make sense of what you are hearing together, not alone afterwards.',
    ],
  ],
  [
    'After',
    [
      'Turn evidence into findings and recommendations.',
      'Document decisions and the commitments they carry.',
      'Show participants what changed because they spoke.',
      'Retain the reasoning, not just the outcome.',
      'Follow actions through to their outcomes.',
      'Keep an institutional memory the next programme can build on.',
    ],
  ],
] as const;

const solutionsBuilding = ['Listen', 'Make sense together', 'Decide', 'Act', 'Learn'] as const;

const comparisons = [
  ['Video and meeting tools', 'Capture the conversation.'],
  ['Survey tools', 'Collect responses.'],
  ['Whiteboards', 'Support ideation.'],
  ['Document systems', 'Store the files.'],
  ['Project systems', 'Track the tasks.'],
] as const;

const audiences = [
  [
    'Workshop & facilitation teams',
    'Run a session without losing what happened in it — capture, evidence and outcomes stay in one traceable place.',
    '/how-it-works',
  ],
  [
    'Co-design programmes',
    'Design solutions with more than one organisation in the room, and keep every perspective attached to the decision it informed.',
    '/platform/co-design',
  ],
  [
    'Community consultation',
    'Show a community what changed because they spoke, not just that you listened.',
    '/solutions/consultation',
  ],
  [
    'Government and policy',
    'Connect public consultation, policy evidence and decisions into a traceable institutional record.',
    '/solutions/government',
  ],
  [
    'International development',
    'Preserve evidence from field engagement through implementation, across partners and countries.',
    '/solutions/international-development',
  ],
  [
    'Research and evidence programmes',
    'Keep the line between what the evidence said and what the programme decided.',
    '/solutions/research',
  ],
  [
    'Institutional learning & organisational memory',
    'Keep the reasoning behind a decision when the people who made it move on.',
    '/platform/institutional-memory',
  ],
] as const;

const outcomes = [
  'Don’t lose what people told you.',
  'Show participants what changed.',
  'Make decisions explainable.',
  'Keep knowledge when staff and consultants leave.',
  'Connect evidence to action.',
  'Learn across programmes instead of starting again.',
  'Build trust through visible reasoning.',
] as const;

export default function MarketingHomepage() {
  const { demoUrl, pricingUrl } = marketingSiteConfig();

  return (
    <div className="homepage">
      <Section id="hero" className="home-hero">
        <div className="hero-copy">
          <Eyebrow>For teams building solutions together</Eyebrow>
          <h1>Build better decisions with the people affected by them.</h1>
          <p className="hero-lede">
            Witness helps organisations run workshops, consultations and co-design processes where
            contributions don&rsquo;t disappear into sticky notes and reports. It keeps the path
            from what people said, to what was learned, to what was decided, to what happens next.
          </p>
          <CTAGroup aria-label="Homepage actions">
            <LinkButton href={demoUrl.href}>Talk to us about your project</LinkButton>
            <LinkButton href="/how-it-works" variant="secondary">
              See how Witness works
            </LinkButton>
            <LinkButton href="/demo" variant="tertiary">
              Explore a worked example
            </LinkButton>
          </CTAGroup>
          <ul className="hero-assurance" aria-label="Why institutions choose Witness">
            <li>Runs securely in your browser — no installation required</li>
            <li>Built for workshops, consultation and co-design</li>
            <li>Every contribution stays traceable to what it produced</li>
          </ul>
        </div>
        <div className="hero-art" aria-hidden="true">
          <span>Painted evidence / Blush canvas</span>
        </div>
      </Section>

      <Section id="problem" className="homepage-section">
        <SectionHeading
          eyebrow="The familiar problem"
          title="A workshop happens. The knowledge shouldn't disappear with it."
        >
          <p>
            People contribute valuable knowledge. Sticky notes, recordings, transcripts, survey
            responses and facilitator notes accumulate. A report gets written. Months later, nobody
            can clearly reconstruct:
          </p>
        </SectionHeading>
        <ul className="problem-list">
          <li>What participants actually said.</li>
          <li>Which evidence influenced which recommendation.</li>
          <li>Why a decision was made.</li>
          <li>Whether commitments were acted on.</li>
          <li>Whether participants&rsquo; contributions changed anything.</li>
        </ul>
        <p className="how-it-works-summary">Witness exists to preserve that chain.</p>
      </Section>

      <Section id="before-during-after" className="homepage-section">
        <SectionHeading
          eyebrow="How Witness supports an engagement"
          title="Before, during and after — not just a final report."
        >
          <p>
            Only capabilities Witness actually supports today — nothing here describes a future
            release.
          </p>
        </SectionHeading>
        <div className="feature-grid audience-grid">
          {engagementStages.map(([title, items]) => (
            <FeatureCard key={title} title={title}>
              <ul className="stage-list">
                {items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </FeatureCard>
          ))}
        </div>
      </Section>

      <Section id="co-design" className="homepage-section ink-section">
        <SectionHeading
          eyebrow="Not just record-keeping"
          title="Witness helps groups build solutions together, not just collect data."
        >
          <p>
            Different perspectives stay attached to the decisions they inform, instead of being
            flattened into a single summary document.
          </p>
        </SectionHeading>
        <div
          className="solutions-building"
          aria-label="Listen, make sense together, decide, act, learn"
        >
          {solutionsBuilding.map((step, index) => (
            <span key={step} className="solutions-building-step">
              <Badge>{step}</Badge>
              {index < solutionsBuilding.length - 1 && (
                <span aria-hidden="true" className="solutions-building-arrow">
                  →
                </span>
              )}
            </span>
          ))}
        </div>
      </Section>

      <Section id="worked-example" className="homepage-section">
        <SectionHeading eyebrow="A worked example" title="See the record, not a mockup.">
          <p>
            This is a synthetic example built from Witness&rsquo;s actual data model — not a generic
            SaaS dashboard invented for marketing. Explore the full walkthrough on{' '}
            <a href="/demo">the demo page</a>.
          </p>
        </SectionHeading>
        <ProductPreview />
        <EvidenceRelationshipDiagram
          title="A workshop contribution, traced end to end"
          description="One contribution, followed all the way through to the outcome it produced."
        >
          <LinearProvenanceChain
            label="Contributor to outcome"
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
        </EvidenceRelationshipDiagram>
        <Callout>That traceable chain is what Witness calls provenance.</Callout>
      </Section>

      <Section id="why-not-tools" className="homepage-section">
        <SectionHeading
          eyebrow="Why not existing tools?"
          title="You probably already have some of this."
        >
          <p>
            None of these replace the others — Witness connects what happens across all of them.
          </p>
        </SectionHeading>
        <div className="feature-grid trust-grid">
          {comparisons.map(([title, description]) => (
            <FeatureCard key={title} title={title}>
              <p>{description}</p>
            </FeatureCard>
          ))}
        </div>
        <p className="how-it-works-summary">
          Witness connects the evidence and reasoning across those stages, so an organisation can
          later explain how a contribution became a decision, and a decision became an action.
        </p>
      </Section>

      <Section id="solutions" className="homepage-section">
        <SectionHeading
          eyebrow="Who Witness is for"
          title="Built for the work that has to be traceable."
        >
          <p>
            Workshop facilitation, co-design, consultation, government, development and research.
          </p>
        </SectionHeading>
        <div className="feature-grid audience-grid">
          {audiences.map(([title, description, href]) => (
            <FeatureCard key={title} title={title}>
              <p>{description}</p>
              <p className="feature-card-link">
                <a href={href}>Learn more →</a>
              </p>
            </FeatureCard>
          ))}
        </div>
      </Section>

      <Section id="outcomes" className="homepage-section">
        <SectionHeading
          eyebrow="What this means for you"
          title="What you get to say, honestly, afterwards."
        />
        <p className="how-it-works-summary">
          Not aspirations — the actual result of using Witness.
        </p>
        <ul className="problem-list outcomes-list">
          {outcomes.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </Section>

      <Section id="trust" className="homepage-section">
        <SectionHeading eyebrow="Trust" title="Governance requires more than a database.">
          <p>
            Once the value is clear: how consent, roles and access, provenance, data sovereignty,
            deployment options and security actually work.{' '}
            <a href="/trust">
              See exactly what Witness deploys, configures and does not yet claim.
            </a>
          </p>
        </SectionHeading>
      </Section>

      <Section id="contact" className="homepage-section homepage-final-cta">
        <SectionHeading title="Talk to us about your project.">
          <p>
            Tell us about the workshop, consultation or programme you&rsquo;re running. We&rsquo;ll
            show you how Witness would fit — no installation required, Witness runs in your browser.
          </p>
        </SectionHeading>
        <CTAGroup aria-label="Contact Witness">
          <LinkButton href={demoUrl.href}>Talk to us about your project</LinkButton>
          <LinkButton href={demoUrl.href} variant="secondary">
            Run a Witness pilot
          </LinkButton>
          <LinkButton href="/how-it-works" variant="tertiary">
            See how it works
          </LinkButton>
          <LinkButton href={pricingUrl.href} variant="tertiary">
            Explore plans
          </LinkButton>
        </CTAGroup>
      </Section>
    </div>
  );
}
