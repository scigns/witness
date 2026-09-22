import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const themeDir = fileURLToPath(
  new URL('../../infrastructure/docker/keycloak-theme/witness/login', import.meta.url),
);
const properties = readFileSync(`${themeDir}/theme.properties`, 'utf8');
const css = readFileSync(`${themeDir}/resources/css/witness.css`, 'utf8');
const realm = readFileSync(
  fileURLToPath(
    new URL('../../infrastructure/docker/init/keycloak/witness-realm.json', import.meta.url),
  ),
  'utf8',
);

describe('Witness Keycloak login theme', () => {
  it('extends the base Keycloak theme rather than replacing templates', () => {
    expect(properties).toContain('parent=keycloak.v2');
    expect(properties).toContain('styles=css/witness.css');
  });

  it('selects the theme from the source-controlled realm default', () => {
    expect(realm).toContain('"loginTheme": "witness"');
  });

  it('uses the canonical Brand Book palette', () => {
    for (const hex of ['#f5f2ed', '#fffdf9', '#1b1917', '#46423d', '#dcd6cc', '#c1481d']) {
      expect(css).toContain(hex);
    }
  });

  it('caps chrome at four pixels and removes elevation from the login card', () => {
    expect(css).toContain('border-radius: 4px');
    expect(css.match(/box-shadow:\s*none/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it('covers inline field-validation errors, not just the page-level alert', () => {
    // Regression guard: the page-level `.alert-error`/`.pf-*-c-alert.pf-m-danger`
    // rule does not apply to the inline "Invalid username or password" state,
    // which uses a separate PatternFly error class and rendered the native
    // PatternFly red until this was added.
    expect(css).toContain('.pf-m-error');
    expect(css).toContain('.pf-v5-c-form__label-required');
  });

  it('respects reduced-motion preference', () => {
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
  });

  it('self-hosts fonts with no external CDN reference', () => {
    expect(css).not.toMatch(/@import\s+url\(['"]?https?:/);
    expect(css).not.toMatch(/src:\s*url\(['"]?https?:/);
    expect(existsSync(`${themeDir}/resources/fonts/Newsreader-Variable.woff2`)).toBe(true);
    expect(existsSync(`${themeDir}/resources/fonts/IBMPlexSans-Variable.woff2`)).toBe(true);
  });
});
