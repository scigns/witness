import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import MarketingHomepage from '../src/app/page';
import robots from '../src/app/robots';
import sitemap from '../src/app/sitemap';
import { GET } from '../src/app/health/route';
import { marketingSiteConfig } from '../src/lib/site-config';
import { canonicalUrl } from '../src/lib/site-config';
import { createMarketingMetadata, DEFAULT_DESCRIPTION } from '../src/lib/metadata';
import { OrganizationStructuredData } from '../src/components/structured-data';
import { marketingNavigation } from '../src/lib/navigation';
import { MarketingShell } from '../src/components/marketing-shell';
import { brandAssets } from '../src/lib/brand-assets';
import {
  Badge,
  Button,
  Callout,
  CTAGroup,
  FeatureCard,
  LinkButton,
  SectionHeading,
  Stat,
} from '../src/components/marketing-primitives';
import {
  BranchingProvenanceChain,
  EvidenceRelationshipDiagram,
  LinearProvenanceChain,
} from '../src/components/provenance';

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return path.endsWith('.ts') || path.endsWith('.tsx') ? [path] : [];
  });
}

function contrastRatio(foreground: string, background: string): number {
  const luminance = (hex: string) => {
    const channels = hex
      .slice(1)
      .match(/.{2}/g)!
      .map((value) => Number.parseInt(value, 16) / 255)
      .map((value) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
    return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
  };
  const lighter = Math.max(luminance(foreground), luminance(background));
  const darker = Math.min(luminance(foreground), luminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

describe('independent marketing foundation', () => {
  it('renders the semantic homepage architecture without authentication or product state', () => {
    const html = renderToStaticMarkup(
      <MarketingShell>
        <MarketingHomepage />
      </MarketingShell>,
    );

    expect(html.match(/<main/g)).toHaveLength(1);
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).toContain('Make important decisions traceable.');
    expect(html).toContain('id="hero"');
    expect(html).toContain('id="open-infrastructure"');
    expect(html).toContain('Illustrative example');
    expect(html).toContain('Institutional Transformation Programme');
    expect(html).toContain('Adopt revised complaints process');
    expect(html).toContain('Action #21');
    expect(html).toContain('Talk to Witness');
    for (const title of [
      'Government',
      'International Development',
      'Research',
      'Consultation &amp; Co-design',
      'Organisations',
      'Regulated Environments',
    ]) {
      expect(html).toContain(title);
    }
    expect(html).toContain('Born in the Pacific. Built for institutions everywhere.');
    expect(html).toContain('open-source foundations');
    expect(html).toContain('Deployment choice');
    const sectionIds = [...html.matchAll(/<section[^>]*id="([^"]+)"/g)].map((match) => match[1]);
    expect(sectionIds).toEqual([
      'hero',
      'problem',
      'how-it-works',
      'product-preview',
      'solutions',
      'provenance',
      'trust',
      'open-infrastructure',
      'contact',
    ]);
    expect(html).not.toMatch(/api\/v1|keycloak|sessionprovider|authprovider/i);
  });

  it('renders accessible header, mobile navigation, actions, and footer landmarks', () => {
    const html = renderToStaticMarkup(
      <MarketingShell>
        <MarketingHomepage />
      </MarketingShell>,
    );

    expect(html).toContain('<header');
    expect(html).toContain('<footer');
    expect(html).toContain('aria-label="Primary navigation"');
    expect(html).toContain('aria-label="Mobile navigation"');
    expect(html).toContain('aria-label="Footer navigation"');
    expect(html).toContain('aria-label="Witness home"');
    expect(html).toContain('src="/brand/witness-logo.png"');
    expect(html).toContain('<summary>Menu</summary>');
    expect(html).toContain('href="#main-content"');
    expect(html).toContain('Skip to main content');
    expect(html).toContain('Sign in');
    expect(html).toContain('Book a demo');
  });

  it('exposes links only for destinations that work today', () => {
    const html = renderToStaticMarkup(
      <MarketingShell>
        <MarketingHomepage />
      </MarketingShell>,
    );
    const hrefs = [...html.matchAll(/href="([^"]+)"/g)].flatMap((match) =>
      match[1] === undefined ? [] : [match[1]],
    );

    expect(marketingNavigation.primary.map((item) => item.label)).toEqual([
      'Platform',
      'Solutions',
      'Resources',
      'Pricing',
      'Trust',
    ]);
    expect(hrefs).toEqual(
      expect.arrayContaining([
        '/',
        '#main-content',
        'https://app.buildwithwitness.com/signin',
        'mailto:hello@buildwithwitness.com?subject=Witness%20demonstration%20request',
        'https://github.com/scigns/witness',
      ]),
    );
    expect(hrefs.some((href) => href.startsWith('/platform'))).toBe(false);
  });

  it('keeps preview origins out of canonical metadata and requires explicit production indexing', () => {
    const preview = marketingSiteConfig({
      WITNESS_MARKETING_SITE_URL: 'https://preview.example',
      WITNESS_MARKETING_INDEXABLE: 'true',
      WITNESS_MARKETING_ENV: 'preview',
    });
    expect(preview.indexable).toBe(false);
    expect(preview.deploymentUrl.href).toBe('https://preview.example/');
    expect(preview.canonicalOrigin.href).toBe('https://buildwithwitness.com/');
    expect(preview.appUrl.href).toBe('https://app.buildwithwitness.com/signin');
    expect(robots()).toEqual({ rules: { userAgent: '*', disallow: '/' } });
    expect(sitemap()[0]?.url).toBe('https://buildwithwitness.com/');

    const production = marketingSiteConfig({
      WITNESS_MARKETING_SITE_URL: 'https://buildwithwitness.com',
      WITNESS_MARKETING_INDEXABLE: 'true',
      WITNESS_MARKETING_ENV: 'production',
    });
    expect(production.indexable).toBe(true);
    expect(robots(production)).toEqual({
      rules: { userAgent: '*', allow: '/' },
      sitemap: 'https://buildwithwitness.com/sitemap.xml',
    });
    expect(canonicalUrl('/platform', preview).href).toBe('https://buildwithwitness.com/platform');
  });

  it('creates complete page metadata with safe social fields', () => {
    const metadata = createMarketingMetadata({
      title: 'Platform | Witness',
      path: '/platform',
    });

    expect(metadata.description).toBe(DEFAULT_DESCRIPTION);
    expect(metadata.alternates?.canonical).toBe('https://buildwithwitness.com/platform');
    expect(metadata.openGraph).toMatchObject({
      type: 'website',
      url: 'https://buildwithwitness.com/platform',
      siteName: 'Witness',
      title: 'Platform | Witness',
      description: DEFAULT_DESCRIPTION,
      locale: 'en_US',
    });
    expect(metadata.twitter).toMatchObject({ card: 'summary', title: 'Platform | Witness' });
    expect(metadata.twitter).not.toHaveProperty('site');
  });

  it('emits parseable, claim-safe organization structured data', () => {
    const html = renderToStaticMarkup(<OrganizationStructuredData />);
    const json = html.match(/<script type="application\/ld\+json">([^<]+)<\/script>/)?.[1];
    expect(json).toBeDefined();
    expect(JSON.parse(json ?? '')).toEqual({
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: 'Witness',
      url: 'https://buildwithwitness.com/',
    });
  });

  it('provides an isolated health response', async () => {
    const response = GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ service: 'witness-marketing', status: 'ok' });
  });

  it('does not import the product application, auth, session, or protected API modules', () => {
    const sourceRoot = join(process.cwd(), 'src');
    const forbidden = [
      /apps\/web/,
      /@witness\/web/,
      /(?:^|\/)lib\/auth/,
      /(?:^|\/)lib\/session/,
      /(?:^|\/)lib\/api/,
    ];

    for (const file of sourceFiles(sourceRoot)) {
      const contents = readFileSync(file, 'utf8');
      for (const pattern of forbidden) expect(contents, file).not.toMatch(pattern);
    }
  });

  it('uses the approved canonical brand asset with explicit intrinsic dimensions', () => {
    expect(brandAssets.logo).toBe('/brand/witness-logo.png');
    expect(existsSync(join(process.cwd(), 'public/brand/witness-logo.png'))).toBe(true);
    const html = renderToStaticMarkup(
      <MarketingShell>
        <MarketingHomepage />
      </MarketingShell>,
    );
    expect(html).toContain('width="566"');
    expect(html).toContain('height="553"');
    expect(html).not.toMatch(/filter:|invert\(|hue-rotate\(/i);
  });

  it('defines one accessible semantic brand palette without automatic dark mode', () => {
    const css = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8');
    const token = (name: string) =>
      css.match(new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, 'i'))?.[1] ?? '';

    expect(css).toContain('color-scheme: light');
    expect(css).not.toContain('prefers-color-scheme');
    expect(css).toContain('--font-size-display');
    expect(css).toContain('--space-24');
    expect(contrastRatio(token('color-ink'), token('color-paper'))).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(token('color-muted'), token('color-paper'))).toBeGreaterThanOrEqual(4.5);
    expect(
      contrastRatio(token('color-primary-ink'), token('color-primary')),
    ).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(token('color-primary'), token('color-surface'))).toBeGreaterThanOrEqual(
      4.5,
    );
    expect(contrastRatio(token('color-accent'), token('color-paper'))).toBeGreaterThanOrEqual(4.5);
  });

  it('renders reusable, semantic marketing primitives without client-side behaviour', () => {
    const html = renderToStaticMarkup(
      <>
        <SectionHeading eyebrow="Evidence" title="A clear heading">
          <p>Supporting copy.</p>
        </SectionHeading>
        <CTAGroup>
          <Button disabled>Submit</Button>
          <LinkButton href="/" variant="secondary">
            Explore
          </LinkButton>
          <LinkButton href="/" variant="tertiary">
            Learn more
          </LinkButton>
        </CTAGroup>
        <FeatureCard eyebrow="Source" title="Consultation">
          <p>Traceable evidence.</p>
        </FeatureCard>
        <Callout>Important context.</Callout>
        <Badge>Verified</Badge>
        <dl>
          <Stat label="Evidence" value={186} />
        </dl>
      </>,
    );

    expect(html).toContain('<h2>A clear heading</h2>');
    expect(html).toContain('<article class="card feature-card">');
    expect(html).toContain('<aside class="callout">');
    expect(html).toContain('class="action action-primary" disabled=""');
    expect(html).toContain('class="action action-secondary"');
    expect(html).toContain('class="action action-tertiary"');
    expect(html).toContain('<dt>Evidence</dt><dd>186</dd>');
  });

  it('renders labelled linear and branching provenance relationships without colour-only meaning', () => {
    const html = renderToStaticMarkup(
      <EvidenceRelationshipDiagram
        title="How evidence informs action"
        description="Every step remains connected."
      >
        <LinearProvenanceChain
          label="Evidence to action"
          steps={[
            { kind: 'evidence', label: 'Evidence' },
            { kind: 'finding', label: 'Finding' },
            { kind: 'decision', label: 'Decision' },
            { kind: 'action', label: 'Action' },
          ]}
        />
        <BranchingProvenanceChain
          label="Multiple sources into one record"
          sources={[
            { kind: 'source', label: 'Meeting' },
            { kind: 'source', label: 'Survey' },
          ]}
          steps={[{ kind: 'evidence', label: 'Evidence' }]}
        />
      </EvidenceRelationshipDiagram>,
    );

    expect(html).toContain('aria-label="How evidence informs action"');
    expect(html).toContain('aria-label="Evidence to action"');
    expect(html).toContain('Multiple sources into one record');
    expect(html).toContain('provenance-node-source');
    expect(html).toContain('provenance-node-decision');
    expect(html).toContain('<span class="visually-hidden">leads to</span>');
  });
});
