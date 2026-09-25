import {
  Badge,
  CTAGroup,
  Eyebrow,
  FeatureCard,
  LinkButton,
  Section,
  SectionHeading,
} from '../../../components/marketing-primitives';
import {
  BranchingProvenanceChain,
  EvidenceRelationshipDiagram,
} from '../../../components/provenance';
import { createMarketingMetadata } from '../../../lib/metadata';
import { marketingSiteConfig } from '../../../lib/site-config';

export const metadata = createMarketingMetadata({
  title: 'Co-design — Witness',
  description:
    'How several organisations, facilitators, reviewers and participants run co-design together in Witness - who can join, how, and who validates what emerges.',
  path: '/platform/co-design',
});

const facts = [
  [
    'Several organisations, one workspace',
    'A workspace can hold participants and reviewers from more than one organisation at once. ' +
      'Access follows explicit membership and role assignment - never a shared login, and never ' +
      'implicit trust because two people are in the same room.',
  ],
  [
    'Four ways to join a session',
    'A facilitator chooses how a session admits people: already-invited members only, a verified ' +
      'guest who signs in without prior access, a pseudonymous name chosen at the door, or fully ' +
      'anonymous. The choice is made once, per session, and enforced the same way regardless of ' +
      'who is joining.',
  ],
  [
    'Voice first, not a form',
    'A participant scans a link, sees who is running the session and what they are being asked to ' +
      'agree to, and can start recording in three taps. Typing is never the only way to contribute.',
  ],
  [
    'Facilitator, reviewer and Knowledge Steward are different jobs',
    'A facilitator runs the session and adds evidence. A reviewer confirms it into the record. A ' +
      'Knowledge Steward curates how concepts connect across sessions. None of the three role is ' +
      'assumed to also be the others.',
  ],
  [
    'A claim can be sent back to the community',
    'Reviewing a candidate claim is not limited to approve or reject - it can be returned for ' +
      'community review, marked qualified, or sent back with a request for clarification before ' +
      'anyone decides what it means.',
  ],
  [
    'Disagreement is recorded, not resolved by majority',
    'When two groups genuinely see something differently, Witness can hold both readings against ' +
      'the same evidence rather than forcing a single official version before anyone is ready to ' +
      'agree on one.',
  ],
] as const;

export default function CoDesignPage() {
  const { demoUrl } = marketingSiteConfig();

  return (
    <div className="foundation-page co-design-page">
      <div className="foundation-heading">
        <Eyebrow>Platform</Eyebrow>
        <h1>Co-design with more than one organisation in the room.</h1>
        <p className="promise">
          Real co-design is not one facilitator and a form. It is several organisations, several
          workshops, and people who join in different ways - all contributing to one accountable
          record.
        </p>
      </div>

      <Section id="facts" className="homepage-section">
        <SectionHeading title="What co-design actually looks like in Witness" />
        <div className="feature-grid audience-grid">
          {facts.map(([title, description]) => (
            <FeatureCard key={title} title={title}>
              <p>{description}</p>
            </FeatureCard>
          ))}
        </div>
      </Section>

      <Section id="joining" className="homepage-section">
        <EvidenceRelationshipDiagram
          title="Several organisations, one session"
          description="A synthetic example of people joining the same session by different, equally governed paths."
        >
          <div>
            <Badge>Illustrative example</Badge>
          </div>
          <BranchingProvenanceChain
            label="Several participants across organisations joining one session"
            sources={[
              { kind: 'contributor', label: 'Invited member', detail: 'Organisation A' },
              { kind: 'contributor', label: 'Verified guest', detail: 'Organisation B' },
              { kind: 'contributor', label: 'Pseudonymous participant' },
            ]}
            steps={[
              { kind: 'contribution', label: 'Session', detail: 'One shared record' },
              { kind: 'evidence', label: 'Evidence', detail: 'Reviewed, not assumed' },
            ]}
          />
        </EvidenceRelationshipDiagram>
      </Section>

      <Section id="contact" className="homepage-section homepage-final-cta">
        <SectionHeading title="See how your own workshops would look inside Witness." />
        <CTAGroup aria-label="Co-design page actions">
          <LinkButton href={demoUrl.href}>Book a demonstration</LinkButton>
          <LinkButton href="/platform/knowledge" variant="secondary">
            How understanding evolves
          </LinkButton>
          <LinkButton href="/platform" variant="tertiary">
            Explore the platform
          </LinkButton>
        </CTAGroup>
      </Section>
    </div>
  );
}
