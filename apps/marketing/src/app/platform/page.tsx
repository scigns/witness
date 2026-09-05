import {
  CTAGroup,
  Eyebrow,
  FeatureCard,
  LinkButton,
  Section,
  SectionHeading,
} from '../../components/marketing-primitives';
import { createMarketingMetadata } from '../../lib/metadata';
import { marketingSiteConfig } from '../../lib/site-config';

export const metadata = createMarketingMetadata({
  title: 'Platform — Witness',
  description:
    'Witness captures evidence, connects it to decisions and commitments, governs who can see and act on it, and keeps the record traceable and rememberable.',
  path: '/platform',
});

const verbs = [
  [
    'Capture',
    'Structured evidence - something said, observed, proposed or objected to - captured during ' +
      "an open co-design session, alongside the session's recording, transcribed and correctable " +
      'by a human without losing the machine output it started from.',
  ],
  [
    'Connect',
    'Evidence links to other evidence. Every decision or commitment records what it rests on - a ' +
      'specific validated piece of evidence, or a stated institutional judgement - never nothing.',
  ],
  [
    'Govern',
    'Participation and every category of consent - being recorded, being quoted, being identified ' +
      '- are decided per participant, against a versioned consent template, fail-closed. Access ' +
      'follows organisation and workspace membership.',
  ],
  [
    'Trace',
    'Every record carries a source, a time and a named actor. Decisions move proposed to confirmed ' +
      'to superseded or reversed - never silently edited. Actions carry a progress note and percent ' +
      'complete, not just a checkbox.',
  ],
  [
    'Remember',
    'Session summaries cite exactly which evidence produced them. A superseded decision keeps ' +
      'pointing at what replaced it. Nothing is deleted to make the record tidier.',
  ],
] as const;

const explore = [
  [
    'How Witness works',
    'The path from an open session to a traceable institutional record.',
    '/how-it-works',
  ],
  ['Why Witness', 'The problem institutional memory has, stated plainly.', '/why-witness'],
  [
    'Evidence & provenance',
    'How something said in a session becomes a structured, sourced record.',
    '/platform/evidence',
  ],
  [
    'Decisions & actions',
    'What a decision has to rest on, and how work gets carried out and traced.',
    '/platform/decisions',
  ],
  [
    'Institutional memory',
    'Built to be read later - by people who were not in the room.',
    '/platform/institutional-memory',
  ],
] as const;

export default function PlatformPage() {
  const { demoUrl } = marketingSiteConfig();

  return (
    <div className="foundation-page">
      <div className="foundation-heading">
        <Eyebrow>The platform</Eyebrow>
        <h1>One system for evidence, decisions and institutional memory.</h1>
        <p className="promise">
          Witness is the evidence layer for work that has to be provable. It is not a single feature
          - it is five things a record needs to survive scrutiny, working together.
        </p>
      </div>

      <Section id="verbs" className="homepage-section">
        <SectionHeading title="Five things every record needs" />
        <div className="feature-grid working-verbs">
          {verbs.map(([title, description]) => (
            <FeatureCard key={title} title={title}>
              <p>{description}</p>
            </FeatureCard>
          ))}
        </div>
      </Section>

      <Section id="explore" className="homepage-section">
        <SectionHeading
          eyebrow="Go deeper"
          title="Explore how each part of the platform actually works."
        />
        <div className="feature-grid audience-grid">
          {explore.map(([title, description, href]) => (
            <FeatureCard key={title} title={title}>
              <p>{description}</p>
              <LinkButton href={href} variant="tertiary">
                Read more
              </LinkButton>
            </FeatureCard>
          ))}
        </div>
      </Section>

      <Section id="contact" className="homepage-section homepage-final-cta">
        <SectionHeading title="See the platform against your own work." />
        <CTAGroup aria-label="Platform page actions">
          <LinkButton href={demoUrl.href}>Book a demonstration</LinkButton>
          <LinkButton href="/how-it-works" variant="secondary">
            How Witness works
          </LinkButton>
        </CTAGroup>
      </Section>
    </div>
  );
}
