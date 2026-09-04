# Witness Commercial Website SEO Plan

**Owner:** Product, Content and Engineering
**Status:** MKT-01C foundation implemented; production indexing intentionally disabled
**Last reviewed:** 2026-09-03

## Current state

The authenticated product remains non-indexable. `apps/marketing` now has a central canonical URL
configuration, reusable page metadata, environment-aware robots, a sitemap containing only `/`, and
claim-safe Organization JSON-LD. `www` does not resolve and no production indexing or routing change
has been made. This preserves the protected product boundary while preparing a future commercial apex.

## Foundation requirements

- Keep app, auth callbacks, previews and non-production environments non-indexable.
- Make only reviewed public marketing routes indexable after the production cutover.
- Add explicit canonical URLs, sitemap and robots outputs with tests.
- Add semantic headings, useful descriptions, Open Graph metadata and appropriate structured data.
- Redirect `www` to the canonical apex only through an approved routing change.
- Maintain fast static content, accessible navigation and valid internal links.

## Canonical and indexing policy

- Canonical production origin is fixed as `https://buildwithwitness.com`; `www`, `app`, localhost and
  preview hosts are never emitted as canonical production URLs.
- `WITNESS_MARKETING_SITE_URL` identifies the current deployment only. Indexing requires the exact
  combination `WITNESS_MARKETING_INDEXABLE=true`, `WITNESS_MARKETING_ENV=production`, and a deployment
  origin matching the canonical origin.
- Local, preview and non-canonical deployments emit `noindex, nofollow` and `Disallow: /` robots.
- When explicitly enabled for the canonical deployment, robots allows `/` and points to the canonical
  sitemap. `/health` and future unimplemented routes are excluded from sitemap and navigation.
- Page titles follow `Witness — Make important decisions traceable` for home and `Page | Witness` for
  later subpages unless a reviewed route decision says otherwise.

## Search intent mapping

Map problem-oriented intent to useful pages: evidence governance, institutional memory, stakeholder
consultation, decision traceability, programme governance, policy consultation, research provenance
and digital sovereignty. Do not create thin pages or keyword-stuffed variants.

## Verification

MKT-01C tests canonical and indexing behaviour by environment, including explicit production robots
allowance and preview blocking. Later releases should validate sitemap URLs, heading structure,
structured data, broken links, page performance and search-console ownership without weakening the
product's `noindex` boundary.
