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
  title: 'Solutions — Witness',
  description:
    'How Witness applies to government, international development, research, and consultation and co-design work.',
  path: '/solutions',
});

const sectors = [
  ['Government', 'Make consultation and public decisions accountable.', '/solutions/government'],
  [
    'International development',
    'Preserve evidence from field engagement through implementation.',
    '/solutions/international-development',
  ],
  [
    'Research',
    'Maintain the connection between evidence, interpretation and impact.',
    '/solutions/research',
  ],
  [
    'Consultation & co-design',
    'Show participants how their contribution influenced the outcome.',
    '/solutions/consultation',
  ],
] as const;

export default function SolutionsPage() {
  const { demoUrl } = marketingSiteConfig();

  return (
    <div className="foundation-page">
      <div className="foundation-heading">
        <Eyebrow>Solutions</Eyebrow>
        <h1>Designed for organisations carrying important decisions forward.</h1>
        <p className="promise">
          The underlying platform is the same everywhere. What differs is which part of the record
          matters most to a given kind of work.
        </p>
      </div>

      <Section id="sectors" className="homepage-section">
        <SectionHeading title="Where Witness applies today" />
        <div className="feature-grid audience-grid">
          {sectors.map(([title, description, href]) => (
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
        <SectionHeading title="Not sure which fits? Talk it through with us." />
        <CTAGroup aria-label="Solutions page actions">
          <LinkButton href={demoUrl.href}>Book a demonstration</LinkButton>
          <LinkButton href="/platform" variant="secondary">
            Explore Witness
          </LinkButton>
        </CTAGroup>
      </Section>
    </div>
  );
}
