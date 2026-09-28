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
  title: 'Get started — Witness',
  description:
    'Three ways to begin with Witness: start free with a small team, move to an organisation plan, or discuss a controlled institutional pilot.',
  path: '/get-started',
});

export default function GetStartedPage() {
  const { appUrl, pricingUrl, demoUrl } = marketingSiteConfig();

  return (
    <div className="foundation-page get-started-page">
      <div className="foundation-heading">
        <Eyebrow>Get started</Eyebrow>
        <h1>Three ways to begin with Witness.</h1>
        <p className="promise">
          Witness runs securely in your browser — no installation required. Choose the option that
          matches where you are today.
        </p>
      </div>

      <Section id="options" className="homepage-section">
        <div className="feature-grid audience-grid">
          <FeatureCard title="A. Start free — small team">
            <p>
              Sign in, create your organisation, and start capturing evidence with a small team on
              the free plan. No procurement, no setup call.
            </p>
            <CTAGroup aria-label="Start free">
              <LinkButton href={appUrl.href}>Start free</LinkButton>
            </CTAGroup>
          </FeatureCard>

          <FeatureCard title="B. Organisation plan">
            <p>
              Already know you need more seats, storage or governance controls? Compare Team,
              Organisation and Institutional plans and request an upgrade from inside the product.
            </p>
            <CTAGroup aria-label="View organisation plans">
              <LinkButton href={pricingUrl.href} variant="secondary">
                View plans
              </LinkButton>
            </CTAGroup>
          </FeatureCard>

          <FeatureCard title="C. Controlled institutional pilot">
            <p>
              For a government, development or institutional deployment with its own governance,
              hosting or procurement requirements, talk to us before you start.
            </p>
            <CTAGroup aria-label="Discuss an institutional pilot">
              <LinkButton href={demoUrl.href} variant="tertiary">
                Discuss an organisational deployment
              </LinkButton>
            </CTAGroup>
          </FeatureCard>
        </div>
      </Section>

      <Section id="what-next" className="homepage-section">
        <SectionHeading title="What happens after you sign in">
          <p>
            You&rsquo;ll create or join a workspace, then capture your first piece of evidence —
            from a session, a document or a note. See the full record model on{' '}
            <a href="/how-it-works">how Witness works</a>.
          </p>
        </SectionHeading>
      </Section>
    </div>
  );
}
