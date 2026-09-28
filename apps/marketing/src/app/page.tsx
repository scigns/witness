import {
  CTAGroup,
  Eyebrow,
  FeatureCard,
  LinkButton,
  Section,
  SectionHeading,
} from '../components/marketing-primitives';
import { BranchingProvenanceChain, LinearProvenanceChain } from '../components/provenance';
import { ProductPreview } from '../components/product-preview';
import { marketingSiteConfig } from '../lib/site-config';

const processSources = [
  { kind: 'source' as const, label: 'Meetings' },
  { kind: 'source' as const, label: 'Documents' },
  { kind: 'source' as const, label: 'Surveys' },
  { kind: 'source' as const, label: 'Research' },
  { kind: 'source' as const, label: 'Consultation' },
];

const useCases = [
  [
    'Co-design & workshops',
    'Run a workshop or multi-organisation co-design session knowing every contribution stays connected to what it produced.',
    '/platform/co-design',
  ],
  [
    'Consultation & community engagement',
    'Show participants and communities what changed because they spoke, not just that you listened.',
    '/solutions/consultation',
  ],
  [
    'Government & public decisions',
    'Connect public consultation, policy evidence and decisions into a traceable institutional record.',
    '/solutions/government',
  ],
  [
    'International development',
    'Preserve evidence from field engagement through implementation, across partners and countries.',
    '/solutions/international-development',
  ],
  [
    'Research & evidence gathering',
    'Keep the line between what the evidence said and what the programme decided.',
    '/solutions/research',
  ],
  [
    'Institutional memory',
    'Keep the reasoning behind a decision when the people who made it move on.',
    '/platform/institutional-memory',
  ],
] as const;

const trustPillars = [
  ['Provenance', 'Every finding and decision traces back to the evidence that produced it.'],
  [
    'Participation & consent',
    'What can be recorded, quoted or attributed is agreed before capture.',
  ],
  ['Access control', 'Roles govern who can contribute, review, decide and administer.'],
  [
    'Deployment choice',
    'Cloud-managed or self-hosted, so an institution keeps control of its own record.',
  ],
] as const;

export default function MarketingHomepage() {
  const { demoUrl, pricingUrl } = marketingSiteConfig();

  return (
    <div className="homepage">
      <Section id="hero" className="home-hero">
        <div className="hero-copy">
          <Eyebrow>Governance evidence infrastructure</Eyebrow>
          <h1>Institutional memory you can prove.</h1>
          <p className="hero-lede">
            Witness captures the evidence behind decisions, not just the decisions themselves — so a
            workshop, consultation or research programme leaves behind a record that shows how you
            got there, not just what you decided.
          </p>
          <CTAGroup aria-label="Homepage actions">
            <LinkButton href="/get-started">Start free</LinkButton>
            <LinkButton href={pricingUrl.href} variant="secondary">
              View plans
            </LinkButton>
            <LinkButton href={demoUrl.href} variant="tertiary">
              Discuss an organisational deployment
            </LinkButton>
          </CTAGroup>
          <p className="hero-commercial-note">
            Free to start. Team and organisation plans are billed in AUD. Institutional deployments
            are quote-based.
          </p>
          <ul className="hero-assurance" aria-label="Why institutions choose Witness">
            <li>Use Witness securely in your browser — no installation required</li>
            <li>Trace every decision back to the evidence behind it</li>
            <li>Keep a portable institutional record your organisation controls</li>
          </ul>
        </div>
        <div className="hero-art" aria-hidden="true">
          <span>Painted evidence / Blush canvas</span>
        </div>
      </Section>

      <Section id="problem" className="homepage-section">
        <SectionHeading
          eyebrow="Why institutional evidence gets lost"
          title="Most organisations remember what they decided. Fewer can show exactly why."
        >
          <p>
            The people who contributed, the evidence they gave, and the reasoning that connected it
            to a decision usually live in separate places — a workshop's sticky notes, a
            consultant's report, someone's inbox. Once a project ends or staff move on, that
            connection is the first thing to disappear.
          </p>
        </SectionHeading>
        <ul className="problem-list">
          <li>Context gets lost when consultants and staff move on.</li>
          <li>Evidence becomes disconnected from the decision it informed.</li>
          <li>Participants never learn what changed because they contributed.</li>
          <li>Nobody can reconstruct why something happened a year later.</li>
        </ul>
      </Section>

      <Section id="how-it-works" className="homepage-section">
        <SectionHeading
          eyebrow="How Witness works"
          title="A traceable record from people to outcomes."
        >
          <p>
            Witness keeps the relationships between what people contributed, what your organisation
            learned, and what it decided to do about it — visible for as long as you need them, not
            just for the length of one project.
          </p>
        </SectionHeading>
        <BranchingProvenanceChain
          label="Sources through evidence, findings, recommendations, decisions and actions"
          sources={processSources}
          steps={[
            { kind: 'evidence', label: 'Evidence' },
            { kind: 'finding', label: 'Finding' },
            { kind: 'recommendation', label: 'Recommendation' },
            { kind: 'decision', label: 'Decision' },
            { kind: 'action', label: 'Action' },
          ]}
        />
        <p className="how-it-works-summary">
          In plain terms: you capture what people contributed, it becomes evidence, evidence is
          weighed and discussed, that deliberation leads to a decision, a decision carries
          commitments and actions — and every step keeps its link back to the one before it. That
          chain is the provenance behind the decision, and it&rsquo;s what turns a project record
          into institutional memory you can still explain a year later.
        </p>
        <CTAGroup aria-label="Learn more about how Witness works">
          <LinkButton href="/get-started" variant="secondary">
            See the step-by-step path
          </LinkButton>
        </CTAGroup>
      </Section>

      <Section id="product-preview" className="homepage-section">
        <SectionHeading eyebrow="The product" title="See the real record, not a mockup.">
          <p>
            This is a synthetic example built from Witness&rsquo;s actual data model — not a generic
            SaaS dashboard invented for marketing. Explore a full walkthrough on{' '}
            <a href="/demo">the demo page</a>.
          </p>
        </SectionHeading>
        <ProductPreview />
      </Section>

      <Section id="use-cases" className="homepage-section">
        <SectionHeading
          eyebrow="Where Witness is useful"
          title="Built for the work that has to be traceable."
        >
          <p>
            Co-design, consultation, government, international development and research programmes
            all share the same problem: evidence and decisions drift apart unless something keeps
            them connected.
          </p>
        </SectionHeading>
        <div className="feature-grid audience-grid">
          {useCases.map(([title, description, href]) => (
            <FeatureCard key={title} title={title}>
              <p>{description}</p>
              <p className="feature-card-link">
                <a href={href}>Learn more →</a>
              </p>
            </FeatureCard>
          ))}
        </div>
      </Section>

      <Section id="provenance" className="homepage-section ink-section">
        <SectionHeading
          eyebrow="Why traceability matters"
          title="Don't just store the decision. Preserve its story."
        >
          <p>
            Every finding, recommendation and decision in Witness keeps its link back to the
            contribution and evidence that produced it — so a decision can always be explained by
            what actually informed it, not by what someone remembers a year later.
          </p>
        </SectionHeading>
        <LinearProvenanceChain
          label="Contributor to action provenance"
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
      </Section>

      <Section id="trust" className="homepage-section">
        <SectionHeading eyebrow="Trust" title="Governance requires more than a database.">
          <p>
            Traceability only matters if participation, access and information are governed properly
            around it.{' '}
            <a href="/trust">
              See exactly what Witness deploys, configures and does not yet claim.
            </a>
          </p>
        </SectionHeading>
        <div className="feature-grid trust-grid">
          {trustPillars.map(([title, description]) => (
            <FeatureCard key={title} title={title}>
              <p>{description}</p>
            </FeatureCard>
          ))}
        </div>
      </Section>

      <Section id="open-infrastructure" className="homepage-section">
        <SectionHeading
          eyebrow="Open infrastructure"
          title="Built in the open. Designed for institutions."
        >
          <p>
            Witness is shaped around transparent architecture, interoperability and public-interest
            infrastructure.
          </p>
        </SectionHeading>
        <p className="pacific-line">Born in the Pacific. Built for institutions everywhere.</p>
        <p className="open-source-note">
          Explore the <a href="https://github.com/scigns/witness">open-source foundations</a> behind
          Witness.
        </p>
      </Section>

      <Section id="contact" className="homepage-section homepage-final-cta">
        <SectionHeading title="Choose the right way to begin with Witness.">
          <p>
            Start free with a small team, compare organisational plans, or discuss a controlled
            institutional pilot — no installation required, Witness runs in your browser.
          </p>
        </SectionHeading>
        <CTAGroup aria-label="Contact Witness">
          <LinkButton href="/get-started">Start free</LinkButton>
          <LinkButton href={pricingUrl.href} variant="secondary">
            View plans
          </LinkButton>
          <LinkButton href={demoUrl.href} variant="tertiary">
            Discuss an organisational deployment
          </LinkButton>
        </CTAGroup>
      </Section>
    </div>
  );
}
