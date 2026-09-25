import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import MarketingHomepage from '../src/app/page';
import PlatformPage, { metadata as platformMetadata } from '../src/app/platform/page';
import HowItWorksPage, { metadata as howItWorksMetadata } from '../src/app/how-it-works/page';
import WhyWitnessPage, { metadata as whyWitnessMetadata } from '../src/app/why-witness/page';
import EvidencePage, { metadata as evidenceMetadata } from '../src/app/platform/evidence/page';
import DecisionsPage, { metadata as decisionsMetadata } from '../src/app/platform/decisions/page';
import InstitutionalMemoryPage, {
  metadata as institutionalMemoryMetadata,
} from '../src/app/platform/institutional-memory/page';
import SolutionsPage, { metadata as solutionsMetadata } from '../src/app/solutions/page';
import GovernmentSolutionPage, {
  metadata as governmentMetadata,
} from '../src/app/solutions/government/page';
import InternationalDevelopmentSolutionPage, {
  metadata as internationalDevelopmentMetadata,
} from '../src/app/solutions/international-development/page';
import ResearchSolutionPage, {
  metadata as researchMetadata,
} from '../src/app/solutions/research/page';
import ConsultationSolutionPage, {
  metadata as consultationMetadata,
} from '../src/app/solutions/consultation/page';
import DemoPage, { metadata as demoMetadata } from '../src/app/demo/page';
import CoDesignPage, { metadata as coDesignMetadata } from '../src/app/platform/co-design/page';
import KnowledgePage, { metadata as knowledgeMetadata } from '../src/app/platform/knowledge/page';
import ChangePage, { metadata as changeMetadata } from '../src/app/platform/change/page';
import TrustPage, { metadata as trustMetadata } from '../src/app/trust/page';
import SecurityPage, { metadata as securityMetadata } from '../src/app/trust/security/page';
import DataSovereigntyPage, {
  metadata as dataSovereigntyMetadata,
} from '../src/app/trust/data-sovereignty/page';
import PrivacyPage, { metadata as privacyMetadata } from '../src/app/trust/privacy/page';
import StoriesPage, { metadata as storiesMetadata } from '../src/app/stories/page';
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
    expect(html).toContain('Discuss a pilot');
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
    expect(html).toContain('src="/brand/witness-logo-transparent.png"');
    expect(html).toContain('<summary>Menu</summary>');
    expect(html).toContain('href="#main-content"');
    expect(html).toContain('Skip to main content');
    expect(html).toContain('Sign in');
    expect(html).toContain('View plans');
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
      'Why Witness',
      'Trust',
    ]);
    expect(hrefs).toEqual(
      expect.arrayContaining([
        '/',
        '#main-content',
        '/platform',
        '/how-it-works',
        '/solutions',
        '/solutions/government',
        '/solutions/international-development',
        '/solutions/research',
        '/solutions/consultation',
        '/trust',
        '/trust/security',
        '/trust/data-sovereignty',
        '/trust/privacy',
        '/stories',
        'https://app.buildwithwitness.com/signin',
        'https://app.buildwithwitness.com/pricing',
        'mailto:hello@buildwithwitness.com?subject=Witness%20institutional%20pilot%20enquiry',
        'https://github.com/scigns/witness',
      ]),
    );
    // The launch navigation exposes only implemented routes.
    expect(hrefs.some((href) => href.startsWith('/pricing'))).toBe(false);
    expect(hrefs.some((href) => href.startsWith('/resources'))).toBe(false);
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
    expect(preview.pricingUrl.href).toBe('https://app.buildwithwitness.com/pricing');
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
    expect(brandAssets.logo).toBe('/brand/witness-logo-transparent.png');
    expect(existsSync(join(process.cwd(), 'public/brand/witness-logo-transparent.png'))).toBe(true);
    expect(existsSync(join(process.cwd(), 'public/brand/imagery/blush-canvas.png'))).toBe(true);
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

  describe('MKT-04 platform story pages', () => {
    const pages = [
      { name: 'platform', Page: PlatformPage, metadata: platformMetadata, path: '/platform' },
      {
        name: 'how-it-works',
        Page: HowItWorksPage,
        metadata: howItWorksMetadata,
        path: '/how-it-works',
      },
      {
        name: 'why-witness',
        Page: WhyWitnessPage,
        metadata: whyWitnessMetadata,
        path: '/why-witness',
      },
      {
        name: 'platform/evidence',
        Page: EvidencePage,
        metadata: evidenceMetadata,
        path: '/platform/evidence',
      },
      {
        name: 'platform/decisions',
        Page: DecisionsPage,
        metadata: decisionsMetadata,
        path: '/platform/decisions',
      },
      {
        name: 'platform/institutional-memory',
        Page: InstitutionalMemoryPage,
        metadata: institutionalMemoryMetadata,
        path: '/platform/institutional-memory',
      },
    ] as const;

    it.each(pages)(
      '$name renders exactly one h1 and safe canonical metadata',
      ({ Page, metadata, path }) => {
        const html = renderToStaticMarkup(
          <MarketingShell>
            <Page />
          </MarketingShell>,
        );

        expect(html.match(/<h1/g)).toHaveLength(1);
        expect(html).not.toMatch(/href="\/platform\/[a-z-]+\/[a-z-]+/); // no accidental nested fake routes
        expect(metadata.alternates?.canonical).toBe(`https://buildwithwitness.com${path}`);
        // Every page inherits the fail-closed default (config.indexable is false outside an
        // explicit production build) via createMarketingMetadata, never an explicit override
        // that would fight it.
        expect(metadata.robots).toEqual({ index: false, follow: false });
      },
    );

    it('cross-links only to routes that exist in this app', () => {
      const realRoutes = new Set([
        '/',
        '/platform',
        '/how-it-works',
        '/why-witness',
        '/platform/evidence',
        '/platform/decisions',
        '/platform/institutional-memory',
        '/solutions', // MarketingShell's footer links these on every page, MKT-04 pages included
        '/solutions/government',
        '/solutions/international-development',
        '/solutions/research',
        '/solutions/consultation',
        '/demo',
        '/platform/co-design',
        '/platform/knowledge',
        '/platform/change',
        '/trust',
        '/trust/security',
        '/trust/data-sovereignty',
        '/trust/privacy',
        '/stories',
        '/brand/witness-logo-transparent.png', // next/image priority preload on every page
      ]);
      for (const { Page } of pages) {
        const html = renderToStaticMarkup(
          <MarketingShell>
            <Page />
          </MarketingShell>,
        );
        const hrefs = [...html.matchAll(/href="([^"]+)"/g)].flatMap((match) =>
          match[1] === undefined ? [] : [match[1]],
        );
        for (const href of hrefs) {
          if (href.startsWith('/') && href !== '#main-content') {
            expect(realRoutes.has(href), `${href} is not a real route`).toBe(true);
          }
        }
      }
    });
  });

  describe('MKT-05 solution pages', () => {
    const pages = [
      { name: 'solutions', Page: SolutionsPage, metadata: solutionsMetadata, path: '/solutions' },
      {
        name: 'solutions/government',
        Page: GovernmentSolutionPage,
        metadata: governmentMetadata,
        path: '/solutions/government',
      },
      {
        name: 'solutions/international-development',
        Page: InternationalDevelopmentSolutionPage,
        metadata: internationalDevelopmentMetadata,
        path: '/solutions/international-development',
      },
      {
        name: 'solutions/research',
        Page: ResearchSolutionPage,
        metadata: researchMetadata,
        path: '/solutions/research',
      },
      {
        name: 'solutions/consultation',
        Page: ConsultationSolutionPage,
        metadata: consultationMetadata,
        path: '/solutions/consultation',
      },
    ] as const;

    it.each(pages)(
      '$name renders exactly one h1 and safe canonical metadata',
      ({ Page, metadata, path }) => {
        const html = renderToStaticMarkup(
          <MarketingShell>
            <Page />
          </MarketingShell>,
        );

        expect(html.match(/<h1/g)).toHaveLength(1);
        expect(metadata.alternates?.canonical).toBe(`https://buildwithwitness.com${path}`);
        expect(metadata.robots).toEqual({ index: false, follow: false });
      },
    );

    it('cross-links only to routes that exist in this app', () => {
      const realRoutes = new Set([
        '/',
        '/platform',
        '/how-it-works',
        '/why-witness',
        '/platform/evidence',
        '/platform/decisions',
        '/platform/institutional-memory',
        '/solutions',
        '/solutions/government',
        '/solutions/international-development',
        '/solutions/research',
        '/solutions/consultation',
        '/demo',
        '/platform/co-design',
        '/platform/knowledge',
        '/platform/change',
        '/trust',
        '/trust/security',
        '/trust/data-sovereignty',
        '/trust/privacy',
        '/stories',
        '/brand/witness-logo-transparent.png',
      ]);
      for (const { Page } of pages) {
        const html = renderToStaticMarkup(
          <MarketingShell>
            <Page />
          </MarketingShell>,
        );
        const hrefs = [...html.matchAll(/href="([^"]+)"/g)].flatMap((match) =>
          match[1] === undefined ? [] : [match[1]],
        );
        for (const href of hrefs) {
          if (href.startsWith('/') && href !== '#main-content') {
            expect(realRoutes.has(href), `${href} is not a real route`).toBe(true);
          }
        }
      }
    });

    it('does not source content from the non-canonical sector applications document', () => {
      // ADR-0021 / docs/product/SECTOR_APPLICATIONS.md is explicitly out of product scope and
      // covers different sectors entirely (disaster response, health, agriculture) — these pages
      // are built from VISION.md and the already-approved homepage audience copy instead.
      for (const { Page } of pages) {
        const html = renderToStaticMarkup(
          <MarketingShell>
            <Page />
          </MarketingShell>,
        );
        for (const term of ['disaster response', 'humanitarian coordination', 'geospatial']) {
          expect(html.toLowerCase()).not.toContain(term);
        }
      }
    });
  });

  describe('MKT-06 synthetic demo', () => {
    it('renders exactly one h1, the synthetic disclosure, and safe canonical metadata', () => {
      const html = renderToStaticMarkup(
        <MarketingShell>
          <DemoPage />
        </MarketingShell>,
      );

      expect(html.match(/<h1/g)).toHaveLength(1);
      expect(html).toContain('Synthetic demonstration');
      expect(html).toContain('fictional and illustrative');
      expect(demoMetadata.alternates?.canonical).toBe('https://buildwithwitness.com/demo');
      expect(demoMetadata.robots).toEqual({ index: false, follow: false });
    });

    it('names no real organisation, customer, or pilot partner', () => {
      const html = renderToStaticMarkup(
        <MarketingShell>
          <DemoPage />
        </MarketingShell>,
      );
      // Real names this programme must never use in synthetic content, regardless of
      // capitalisation or context — see docs/commercial-website/DECISIONS.md.
      const forbidden = [
        'SPC',
        'Ministry of Justice',
        'DFAT',
        'FTA',
        'SPREP',
        'Fiji',
        'Pacific Community',
      ];
      for (const name of forbidden) {
        expect(html).not.toContain(name);
      }
    });

    it('does not import the product application, auth, session, protected API, or a graphing library', () => {
      const contents = readFileSync(join(process.cwd(), 'src/app/demo/page.tsx'), 'utf8');
      expect(contents).not.toMatch(/apps\/web|@witness\/web|lib\/auth|lib\/session|lib\/api/);
      expect(contents).not.toMatch(/d3|chart\.js|recharts|visx|three\b/i);
      expect(contents).not.toMatch(/document\.cookie|credentials:\s*['"]include['"]|fetch\(/);
    });

    it('cross-links only to routes that exist in this app', () => {
      const realRoutes = new Set([
        '/',
        '/platform',
        '/how-it-works',
        '/why-witness',
        '/platform/evidence',
        '/platform/decisions',
        '/platform/institutional-memory',
        '/solutions',
        '/solutions/government',
        '/solutions/international-development',
        '/solutions/research',
        '/solutions/consultation',
        '/demo',
        '/platform/co-design',
        '/platform/knowledge',
        '/platform/change',
        '/trust',
        '/trust/security',
        '/trust/data-sovereignty',
        '/trust/privacy',
        '/stories',
        '/brand/witness-logo-transparent.png',
      ]);
      const html = renderToStaticMarkup(
        <MarketingShell>
          <DemoPage />
        </MarketingShell>,
      );
      const hrefs = [...html.matchAll(/href="([^"]+)"/g)].flatMap((match) =>
        match[1] === undefined ? [] : [match[1]],
      );
      for (const href of hrefs) {
        if (href.startsWith('/') && href !== '#main-content') {
          expect(realRoutes.has(href), `${href} is not a real route`).toBe(true);
        }
      }
    });

    it('uses only real consent category names from packages/domain, not invented labels', () => {
      const html = renderToStaticMarkup(
        <MarketingShell>
          <DemoPage />
        </MarketingShell>,
      );
      // packages/domain/src/consent-template.ts CONSENT_CATEGORIES, human-readable form.
      for (const category of [
        'Participation',
        'Audio recording',
        'Internal use',
        'Attributed quotation',
      ]) {
        expect(html).toContain(category);
      }
    });
  });

  describe('Phase 6 platform depth pages (co-design, knowledge, change)', () => {
    const pages = [
      {
        name: 'platform/co-design',
        Page: CoDesignPage,
        metadata: coDesignMetadata,
        path: '/platform/co-design',
      },
      {
        name: 'platform/knowledge',
        Page: KnowledgePage,
        metadata: knowledgeMetadata,
        path: '/platform/knowledge',
      },
      {
        name: 'platform/change',
        Page: ChangePage,
        metadata: changeMetadata,
        path: '/platform/change',
      },
    ] as const;

    it.each(pages)(
      '$name renders exactly one h1 and safe canonical metadata',
      ({ Page, metadata, path }) => {
        const html = renderToStaticMarkup(
          <MarketingShell>
            <Page />
          </MarketingShell>,
        );
        expect(html.match(/<h1/g)).toHaveLength(1);
        expect(metadata.alternates?.canonical).toBe(`https://buildwithwitness.com${path}`);
        expect(metadata.robots).toEqual({ index: false, follow: false });
      },
    );

    it('uses only real perspective/consent vocabulary from packages/domain', () => {
      const html = renderToStaticMarkup(
        <MarketingShell>
          <KnowledgePage />
        </MarketingShell>,
      );
      // packages/domain/src/knowledge-assertion.ts PERSPECTIVE_TAGS, human-readable form.
      for (const tag of [
        'contested',
        'minority perspective',
        'culturally significant',
        'unresolved',
      ]) {
        expect(html.toLowerCase()).toContain(tag);
      }
    });

    it('cross-links only to routes that exist in this app', () => {
      const realRoutes = new Set([
        '/',
        '/platform',
        '/platform/evidence',
        '/platform/decisions',
        '/platform/institutional-memory',
        '/platform/co-design',
        '/platform/knowledge',
        '/platform/change',
        '/solutions',
        '/solutions/government',
        '/solutions/international-development',
        '/solutions/research',
        '/solutions/consultation',
        '/how-it-works',
        '/why-witness',
        '/demo',
        '/trust',
        '/trust/security',
        '/trust/data-sovereignty',
        '/trust/privacy',
        '/stories',
        '/brand/witness-logo-transparent.png',
      ]);
      for (const { Page } of pages) {
        const html = renderToStaticMarkup(
          <MarketingShell>
            <Page />
          </MarketingShell>,
        );
        const hrefs = [...html.matchAll(/href="([^"]+)"/g)].flatMap((match) =>
          match[1] === undefined ? [] : [match[1]],
        );
        for (const href of hrefs) {
          if (href.startsWith('/') && href !== '#main-content') {
            expect(realRoutes.has(href), `${href} is not a real route`).toBe(true);
          }
        }
      }
    });
  });

  describe('Phase 6 trust centre', () => {
    const pages = [
      { name: 'trust', Page: TrustPage, metadata: trustMetadata, path: '/trust' },
      {
        name: 'trust/security',
        Page: SecurityPage,
        metadata: securityMetadata,
        path: '/trust/security',
      },
      {
        name: 'trust/data-sovereignty',
        Page: DataSovereigntyPage,
        metadata: dataSovereigntyMetadata,
        path: '/trust/data-sovereignty',
      },
      {
        name: 'trust/privacy',
        Page: PrivacyPage,
        metadata: privacyMetadata,
        path: '/trust/privacy',
      },
    ] as const;

    it.each(pages)(
      '$name renders exactly one h1 and safe canonical metadata',
      ({ Page, metadata, path }) => {
        const html = renderToStaticMarkup(
          <MarketingShell>
            <Page />
          </MarketingShell>,
        );
        expect(html.match(/<h1/g)).toHaveLength(1);
        expect(metadata.alternates?.canonical).toBe(`https://buildwithwitness.com${path}`);
        expect(metadata.robots).toEqual({ index: false, follow: false });
      },
    );

    it('never claims a certification Witness does not hold, on any trust page', () => {
      const forbidden = ['SOC 2', 'SOC2', 'ISO 27001', 'ISO27001', 'HIPAA compliant', 'FedRAMP'];
      for (const { Page } of pages) {
        const html = renderToStaticMarkup(
          <MarketingShell>
            <Page />
          </MarketingShell>,
        );
        for (const claim of forbidden) {
          // The only permitted appearance is inside an explicit denial sentence
          // ("does not hold", "No SOC 2"), never a bare claim.
          if (html.includes(claim)) {
            const context = html.slice(Math.max(0, html.indexOf(claim) - 40), html.indexOf(claim));
            expect(/no |not |does not/i.test(context)).toBe(true);
          }
        }
      }
    });

    it('cross-links only to routes that exist in this app', () => {
      const realRoutes = new Set([
        '/',
        '/platform',
        '/platform/evidence',
        '/platform/decisions',
        '/platform/institutional-memory',
        '/platform/co-design',
        '/platform/knowledge',
        '/platform/change',
        '/how-it-works',
        '/why-witness',
        '/demo',
        '/solutions',
        '/solutions/government',
        '/solutions/international-development',
        '/solutions/research',
        '/solutions/consultation',
        '/trust',
        '/trust/security',
        '/trust/data-sovereignty',
        '/trust/privacy',
        '/stories',
        '/brand/witness-logo-transparent.png',
      ]);
      for (const { Page } of pages) {
        const html = renderToStaticMarkup(
          <MarketingShell>
            <Page />
          </MarketingShell>,
        );
        const hrefs = [...html.matchAll(/href="([^"]+)"/g)].flatMap((match) =>
          match[1] === undefined ? [] : [match[1]],
        );
        for (const href of hrefs) {
          if (href.startsWith('/') && href !== '#main-content') {
            expect(realRoutes.has(href), `${href} is not a real route`).toBe(true);
          }
        }
      }
    });
  });

  describe('Phase 6 customer stories', () => {
    it('renders exactly one h1, an honest empty state, and safe canonical metadata', () => {
      const html = renderToStaticMarkup(
        <MarketingShell>
          <StoriesPage />
        </MarketingShell>,
      );
      expect(html.match(/<h1/g)).toHaveLength(1);
      expect(html).toContain('No public stories yet');
      expect(storiesMetadata.alternates?.canonical).toBe('https://buildwithwitness.com/stories');
      expect(storiesMetadata.robots).toEqual({ index: false, follow: false });
    });

    it('does not import the product application, auth, session, or protected API', () => {
      const contents = readFileSync(join(process.cwd(), 'src/app/stories/page.tsx'), 'utf8');
      expect(contents).not.toMatch(/apps\/web|@witness\/web|lib\/auth|lib\/session|lib\/api/);
      expect(contents).not.toMatch(/document\.cookie|credentials:\s*['"]include['"]|fetch\(/);
    });
  });
});
