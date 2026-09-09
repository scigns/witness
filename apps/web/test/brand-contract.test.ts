import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const webCss = readFileSync(
  fileURLToPath(new URL('../src/app/globals.css', import.meta.url)),
  'utf8',
);
const marketingCss = readFileSync(
  fileURLToPath(new URL('../../marketing/src/app/globals.css', import.meta.url)),
  'utf8',
);

const PALETTE = {
  ink: '#1b1917',
  graphite: '#46423d',
  ash: '#8a857d',
  mist: '#dcd6cc',
  bone: '#f5f2ed',
  gesso: '#fffdf9',
  ember: '#c1481d',
  blush: '#e3b4a2',
  ochre: '#f1cd8e',
} as const;

describe('one Witness brand contract', () => {
  it('keeps product and marketing on the canonical palette', () => {
    for (const [name, value] of Object.entries(PALETTE)) {
      expect(webCss).toContain(`--witness-${name}: ${value}`);
      expect(marketingCss).toContain(`--witness-${name}: ${value}`);
    }
  });

  it('uses the Brand Book type roles and controlled light surface', () => {
    expect(webCss).toContain('--witness-font-editorial: var(--font-newsreader)');
    expect(webCss).toContain('--witness-font-sans: var(--font-plex-sans)');
    expect(webCss).toContain('--witness-font-mono: var(--font-plex-mono)');
    expect(webCss).toContain('color-scheme: light');
    expect(webCss).not.toContain('@media (prefers-color-scheme: dark)');
  });

  it('caps chrome at four pixels and removes elevation', () => {
    expect(webCss).toContain('--radius-witness: 4px');
    expect(webCss).toContain('box-shadow: none !important');
  });
});
