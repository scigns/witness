import type { PublishedStoryCard } from '@witness/contracts';

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
import { fetchPublishedStories } from '../../lib/stories-api';

export const metadata = createMarketingMetadata({
  title: 'Customer stories — Witness',
  description:
    'Real Witness customer stories, published only with the explicit permission of the organisation and participants involved.',
  path: '/stories',
});

/**
 * Content-driven, not hardcoded: a published story is a `PublishedStoryCard`
 * fetched from the public read-only stories endpoint the customer-learning
 * track's governed moderation-and-publication workflow produces — never
 * text pasted into this page's own source. See
 * docs/commercial-website/DECISIONS.md's customer-evidence approval gate: a
 * story appears here only after an organisation and its participants have
 * given explicit publication consent, reviewed and published through
 * Witness's own moderation workflow, independent of the underlying product
 * feedback that led to it.
 */
function storyKey(story: PublishedStoryCard, index: number): string {
  return `${story.organisationLabel}-${index}`;
}

export default async function StoriesPage() {
  const { demoUrl } = marketingSiteConfig();
  const publishedStories = await fetchPublishedStories();

  return (
    <div className="foundation-page stories-page">
      <div className="foundation-heading">
        <Eyebrow>Stories</Eyebrow>
        <h1>What organisations using Witness actually say.</h1>
        <p className="promise">
          Every story here is published with the explicit, recorded permission of the organisation
          and the participants involved - never an internal quote republished without asking again
          for this specific use.
        </p>
      </div>

      {publishedStories.length === 0 ? (
        <Section id="none-yet" className="homepage-section">
          <SectionHeading title="No public stories yet" />
          <FeatureCard title="Publication requires explicit permission, every time">
            <p>
              A customer story is only published here after the organisation and the participants it
              involves have given specific, recorded permission for that publication - separately
              from any product feedback they gave along the way. Anonymous publication is supported
              for organisations or participants who want to share what happened without being named.
            </p>
          </FeatureCard>
        </Section>
      ) : (
        <Section id="stories" className="homepage-section">
          <div className="feature-grid audience-grid">
            {publishedStories.map((story, index) => (
              <FeatureCard key={storyKey(story, index)} title={story.organisationLabel}>
                <p>&ldquo;{story.quote}&rdquo;</p>
                <p>
                  {story.attributedName !== undefined ? `${story.attributedName} · ` : ''}
                  {story.role} &middot; {story.context}
                </p>
              </FeatureCard>
            ))}
          </div>
        </Section>
      )}

      <Section id="contact" className="homepage-section homepage-final-cta">
        <SectionHeading title="Using Witness, and willing to share what happened?" />
        <CTAGroup aria-label="Stories page actions">
          <LinkButton href={demoUrl.href}>Talk to us</LinkButton>
          <LinkButton href="/solutions" variant="tertiary">
            See who Witness is built for
          </LinkButton>
        </CTAGroup>
      </Section>
    </div>
  );
}
