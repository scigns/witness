import {
  Badge,
  CTAGroup,
  Callout,
  Eyebrow,
  FeatureCard,
  LinkButton,
  Section,
  SectionHeading,
  Stat,
} from '../../components/marketing-primitives';
import { LinearProvenanceChain } from '../../components/provenance';
import { createMarketingMetadata } from '../../lib/metadata';
import { marketingSiteConfig } from '../../lib/site-config';

export const metadata = createMarketingMetadata({
  title: 'Demonstration — Witness',
  description:
    'A synthetic, illustrative walk-through of one Witness record - from a consented session to a traced, confirmed decision. No customer data is shown.',
  path: '/demo',
});

const programmeStats = [
  ['Contributors', 42],
  ['Evidence items', 128],
  ['Findings', 11],
  ['Recommendations', 7],
  ['Decisions', 4],
  ['Actions', 9],
] as const;

const evidenceItems = [
  ['Community session #07', 'Submitted', '2026-03-11'],
  ['Staff workshop #03', 'Submitted', '2026-03-18'],
  ['Service review #02', 'Submitted', '2026-04-02'],
  ['Policy analysis #05', 'Submitted', '2026-04-09'],
] as const;

export default function DemoPage() {
  const { demoUrl, pricingUrl } = marketingSiteConfig();

  return (
    <div className="foundation-page">
      <div className="foundation-heading">
        <Eyebrow>Demonstration</Eyebrow>
        <h1>Follow one record from a session to a traced decision.</h1>
        <p className="promise">
          Not a dashboard tour. A walk-through of what Witness actually keeps connected, using one
          illustrative programme end to end.
        </p>
        <Callout>
          <p>
            <strong>Synthetic demonstration.</strong> Every name, session and record below is
            fictional and illustrative. No customer data, real consultation or real institution is
            shown.
          </p>
        </Callout>
      </div>

      <Section id="programme" className="homepage-section">
        <SectionHeading eyebrow="The programme" title="Service Improvement Programme">
          <p>
            A fictional local-government programme reviewing how people access frontline services.
            Illustrative scale, not a claim about any real deployment.
          </p>
        </SectionHeading>
        <dl className="product-metrics" aria-label="Illustrative programme metrics">
          {programmeStats.map(([label, value]) => (
            <Stat key={label} label={label} value={value} />
          ))}
        </dl>
      </Section>

      <Section id="session" className="homepage-section">
        <SectionHeading
          eyebrow="Session & consent"
          title="Consent is decided per contributor, before anything is captured."
        >
          <p>
            Community session #07 ran with 14 contributors. What could be recorded, quoted or
            attributed was agreed with each person first - not applied afterward as a redaction
            pass.
          </p>
        </SectionHeading>
        <div className="card">
          <div className="preview-record-heading">
            <p className="eyebrow eyebrow-mono">Contributor #09</p>
            <Badge>Community session #07</Badge>
          </div>
          <ul className="supporting-records">
            <li>Participation - consented</li>
            <li>Audio recording - consented</li>
            <li>Internal use - consented</li>
            <li>Attributed quotation - not consented</li>
          </ul>
          <p className="preview-muted">
            This contributor can be quoted internally, without their name attached externally -
            exactly what they agreed to, nothing more.
          </p>
        </div>
      </Section>

      <Section id="evidence" className="homepage-section">
        <SectionHeading eyebrow="Evidence considered" title="Four sources feed this record.">
          <p>Time, actor and state, before anything decorative.</p>
        </SectionHeading>
        <ul className="supporting-records">
          {evidenceItems.map(([label, status, date]) => (
            <li key={label}>
              <span className="eyebrow-mono">{date}</span> — {label} — {status}
            </li>
          ))}
        </ul>
      </Section>

      <Section id="finding" className="homepage-section">
        <SectionHeading eyebrow="Finding & recommendation" title="What the evidence adds up to.">
          <p>
            Witness does not store a separate "finding" record - this is the narrative bridge a
            person writes between evidence and a decision, and it stays attached to the evidence
            above it.
          </p>
        </SectionHeading>
        <div className="product-preview-detail">
          <FeatureCard title="Finding">
            <p>People encountered inconsistent intake requirements across service points.</p>
          </FeatureCard>
          <FeatureCard title="Recommendation">
            <p>Standardise intake requirements and publish one shared process.</p>
          </FeatureCard>
        </div>
      </Section>

      <Section id="decision" className="homepage-section">
        <SectionHeading eyebrow="Decision" title="A decision has to rest on something." />
        <div className="card">
          <div className="preview-record-heading">
            <p className="eyebrow eyebrow-mono">Decision #04</p>
            <Badge>Confirmed</Badge>
          </div>
          <h3>Adopt revised intake process</h3>
          <p className="preview-muted">
            Rests on: Community session #07, Staff workshop #03, Service review #02, Policy analysis
            #05
          </p>
          <ul className="supporting-records">
            <li>
              <span className="eyebrow-mono">2026-04-14</span> — Proposed by Programme Lead
            </li>
            <li>
              <span className="eyebrow-mono">2026-04-21</span> — Sign-off: confirmed by Service
              Director
            </li>
          </ul>
        </div>
      </Section>

      <Section id="commitment" className="homepage-section">
        <SectionHeading eyebrow="Commitment & action" title="What happens next, and who owns it." />
        <div className="product-preview-detail">
          <div className="card">
            <p className="eyebrow eyebrow-mono">Commitment</p>
            <h3>Owned by the Frontline Services team</h3>
            <Stat label="Status" value="Active" />
          </div>
          <div className="card">
            <p className="eyebrow eyebrow-mono">Action #21</p>
            <h3>Publish the revised process and brief frontline teams</h3>
            <p className="preview-muted">
              <span className="attention-dot" aria-hidden="true" />
              In progress - 60% complete
            </p>
          </div>
        </div>
      </Section>

      <Section id="provenance" className="homepage-section">
        <SectionHeading eyebrow="Provenance" title="The whole path, in order." />
        <LinearProvenanceChain
          label="Illustrative session to action relationship"
          steps={[
            { kind: 'contributor', label: 'Contributor #09' },
            { kind: 'evidence', label: 'Evidence', detail: '4 sources' },
            { kind: 'finding', label: 'Finding' },
            { kind: 'recommendation', label: 'Recommendation' },
            { kind: 'decision', label: 'Decision #04', detail: 'Confirmed' },
            { kind: 'action', label: 'Action #21', detail: 'In progress' },
          ]}
        />
      </Section>

      <Section id="memory" className="homepage-section">
        <SectionHeading eyebrow="Later" title="What can be reconstructed, and by whom.">
          <p>
            A year from now, someone who was never in the room can open Decision #04 and see exactly
            what it rested on, who confirmed it, and what Action #21 has done about it - without
            asking anyone who remembers the meeting.
          </p>
        </SectionHeading>
      </Section>

      <Section id="contact" className="homepage-section homepage-final-cta">
        <SectionHeading title="See how Witness could work in your organisation." />
        <CTAGroup aria-label="Demo page actions">
          <LinkButton href={pricingUrl.href}>View plans</LinkButton>
          <LinkButton href={demoUrl.href} variant="secondary">
            Discuss a pilot
          </LinkButton>
          <LinkButton href="/how-it-works" variant="tertiary">
            How Witness works
          </LinkButton>
        </CTAGroup>
      </Section>
    </div>
  );
}
