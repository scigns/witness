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

const workingVerbs = [
  [
    'Capture',
    'Bring together evidence from consultation, research, meetings and institutional work.',
  ],
  ['Connect', 'Preserve the relationships between contributors, evidence, findings and decisions.'],
  [
    'Govern',
    'Maintain access, participation and accountability around important organisational records.',
  ],
  ['Trace', 'Follow a decision back through the evidence and reasoning that produced it.'],
  [
    'Remember',
    'Preserve institutional knowledge after projects, consultants and staff have moved on.',
  ],
] as const;

const audiences = [
  [
    'Government',
    'Make consultation and public decisions accountable.',
    'Connect public engagement, policy evidence and decisions into a traceable institutional record.',
  ],
  [
    'International Development',
    'Preserve evidence from field engagement through implementation.',
    'Support programmes where consultation, research, partners and implementation span organisations and countries.',
  ],
  [
    'Research',
    'Maintain the connection between evidence, interpretation and impact.',
    'Preserve how research evidence contributes to recommendations, policy and programme decisions.',
  ],
  [
    'Consultation & Co-design',
    'Show participants how their contribution influenced the outcome.',
    'Create a clearer path from participation to findings, recommendations and institutional decisions.',
  ],
  [
    'Organisations',
    'Keep institutional knowledge when people and projects change.',
    'Reduce knowledge loss when staff, consultants and programmes move on.',
  ],
  [
    'Regulated Environments',
    'Strengthen traceability and governance.',
    'Maintain clearer evidence trails around accountable institutional decisions.',
  ],
] as const;

const trustPillars = [
  ['Provenance', 'Preserve the traceable history behind decisions.'],
  ['Access control', 'Govern participation and organisational access.'],
  ['Portability', 'Maintain organisational control over institutional information.'],
  [
    'Deployment choice',
    'Support institutions with different infrastructure and hosting requirements.',
  ],
] as const;

export default function MarketingHomepage() {
  const { appUrl, demoUrl } = marketingSiteConfig();

  return (
    <div className="homepage">
      <Section id="hero" className="home-hero">
        <Eyebrow>Evidence governance</Eyebrow>
        <h1>Make important decisions traceable.</h1>
        <p className="hero-lede">
          Witness is the evidence layer for work that has to be provable. It connects evidence,
          consultation, decisions and actions into an accountable institutional record.
        </p>
        <CTAGroup aria-label="Homepage actions">
          <LinkButton href={demoUrl.href}>Book a demonstration</LinkButton>
          <LinkButton href="#how-it-works" variant="secondary">
            Explore Witness
          </LinkButton>
          <LinkButton href={appUrl.href} variant="tertiary">
            Sign in
          </LinkButton>
        </CTAGroup>
      </Section>

      <Section id="problem" className="homepage-section">
        <SectionHeading
          eyebrow="The problem"
          title="Most organisations remember what they decided. Fewer can show exactly why."
        >
          <p>
            Institutional evidence often becomes fragmented across meetings, documents, surveys,
            interviews, workshops, research, consultation and organisational memory.
          </p>
        </SectionHeading>
        <ul className="problem-list">
          <li>Context gets lost.</li>
          <li>Consultants and staff move on.</li>
          <li>Evidence becomes disconnected from decisions.</li>
          <li>Organisations struggle to reconstruct why something happened.</li>
        </ul>
      </Section>

      <Section id="how-it-works" className="homepage-section">
        <SectionHeading
          eyebrow="How Witness works"
          title="Connect the record from source to action."
        >
          <p>
            Witness keeps the relationships between what people contribute, what organisations
            learn, and what they decide visible over time.
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
        <div className="feature-grid working-verbs">
          {workingVerbs.map(([title, description]) => (
            <FeatureCard key={title} title={title}>
              <p>{description}</p>
            </FeatureCard>
          ))}
        </div>
      </Section>

      <Section id="product-preview" className="homepage-section">
        <SectionHeading eyebrow="The platform" title="A clearer institutional record.">
          <p>
            See how evidence, decisions and actions can remain connected in one accountable view.
          </p>
        </SectionHeading>
        <ProductPreview />
      </Section>
      <Section id="solutions" className="homepage-section">
        <SectionHeading
          eyebrow="Who it is for"
          title="Designed for organisations carrying important decisions forward."
        >
          <p>
            Witness supports public, research, development, consultation and regulated environments.
          </p>
        </SectionHeading>
        <div className="feature-grid audience-grid">
          {audiences.map(([title, summary, description]) => (
            <FeatureCard key={title} title={title}>
              <p className="audience-summary">{summary}</p>
              <p>{description}</p>
            </FeatureCard>
          ))}
        </div>
      </Section>
      <Section id="provenance" className="homepage-section">
        <SectionHeading
          eyebrow="Provenance by design"
          title="Don't just store the decision. Preserve its story."
        >
          <p>
            Keep the relationships between contribution, evidence, interpretation, decision and
            action.
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
            Traceability, governed participation, information control and deployment choices matter.
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
        <SectionHeading title="Ready to see how Witness could work in your organisation?" />
        <CTAGroup aria-label="Contact Witness">
          <LinkButton href={demoUrl.href}>Book a demonstration</LinkButton>
          <LinkButton href="#how-it-works" variant="secondary">
            Explore Witness
          </LinkButton>
          <LinkButton href={demoUrl.href} variant="tertiary">
            Talk to Witness
          </LinkButton>
        </CTAGroup>
      </Section>
    </div>
  );
}
