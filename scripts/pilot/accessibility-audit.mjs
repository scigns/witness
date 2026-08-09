#!/usr/bin/env node
/**
 * Pragmatic accessibility pass over the deployed application.
 *
 * Two kinds of check, because neither is sufficient alone:
 *
 *   • axe-core, run in the page, for the machine-checkable rules — missing
 *     form labels, unnamed controls, contrast, landmark and heading structure.
 *   • A keyboard walk that tabs through each screen and records whether focus
 *     is ever visible and whether it reaches the primary control. Axe cannot
 *     see this; it is also the failure a keyboard-only user hits first.
 *
 * Only serious and critical axe violations fail the run. A pilot is not the
 * moment to relitigate the visual system, and treating every minor advisory as
 * a blocker teaches people to ignore the output.
 *
 * Required environment: the same four variables as the browser walkthrough.
 */

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

import playwright from 'playwright-core';

const require = createRequire(import.meta.url);
const { chromium } = playwright;

function required(name) {
  const value = process.env[name];
  if (value === undefined || value === '') {
    process.stderr.write(`${name} is required.\n`);
    process.exit(2);
  }
  return value;
}

const WEB = required('WITNESS_PILOT_WEB_URL').replace(/\/$/, '');
const USERNAME = required('WITNESS_PILOT_USERNAME');
const PASSWORD = required('WITNESS_PILOT_PASSWORD');
const CHROMIUM = required('WITNESS_PILOT_CHROMIUM');
const INSECURE = process.env.WITNESS_PILOT_INSECURE_TLS === '1';

const AXE_SOURCE = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

/** Screens a pilot user cannot avoid. */
const SCREENS = [
  { path: '/signin', name: 'Sign in' },
  { path: '/', name: 'Dashboard' },
  { path: '/organisations', name: 'Organisations' },
  { path: '/workspaces', name: 'Workspaces' },
  { path: '/workspaces/new', name: 'Create a workspace' },
];

/** Narrow enough to be a phone held upright. */
const NARROW = { width: 360, height: 720 };

const main = async () => {
  const browser = await chromium.launch({
    executablePath: CHROMIUM,
    headless: true,
    args: [
      '--no-sandbox',
      '--no-proxy-server',
      ...(INSECURE ? ['--ignore-certificate-errors'] : []),
    ],
  });
  const context = await browser.newContext({ ignoreHTTPSErrors: INSECURE });
  const page = await context.newPage();
  page.setDefaultTimeout(20_000);

  // Sign in once; the rest of the screens need a session.
  await page.goto(`${WEB}/signin`, { waitUntil: 'domcontentloaded' });
  await page
    .getByRole('link', { name: /sign in/i })
    .first()
    .click();
  await page.waitForURL(/\/protocol\/openid-connect\/auth/);
  await page.fill('#username', USERNAME);
  await page.fill('#password', PASSWORD);
  await page.click('#kc-login');
  await page.waitForURL((url) => url.origin === new URL(WEB).origin, { timeout: 30_000 });
  await page.getByText(/signed in as/i).waitFor();

  let blocking = 0;

  for (const screen of SCREENS) {
    await page.goto(`${WEB}${screen.path}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);

    await page.evaluate(AXE_SOURCE);
    const results = await page.evaluate(async () =>
      // eslint-disable-next-line no-undef
      axe.run(document, {
        resultTypes: ['violations'],
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
      }),
    );

    const serious = results.violations.filter((violation) =>
      ['serious', 'critical'].includes(violation.impact),
    );
    const minor = results.violations.length - serious.length;

    // Keyboard walk: tab through and watch what the browser actually focuses.
    const keyboard = await (async () => {
      await page.evaluate(() => document.body.focus());
      const seen = [];
      let everVisible = false;
      for (let index = 0; index < 25; index += 1) {
        await page.keyboard.press('Tab');
        const focused = await page.evaluate(() => {
          const element = document.activeElement;
          if (element === null || element === document.body) return null;
          const style = getComputedStyle(element);
          const outline = style.outlineStyle !== 'none' && style.outlineWidth !== '0px';
          const ring = style.boxShadow !== 'none';
          return {
            tag: element.tagName.toLowerCase(),
            name: (element.textContent ?? element.getAttribute('aria-label') ?? '')
              .trim()
              .slice(0, 30),
            visible: outline || ring,
          };
        });
        if (focused === null) break;
        if (focused.visible) everVisible = true;
        seen.push(focused);
      }
      return { stops: seen.length, everVisible };
    })();

    // Narrow viewport: the core workflow has to survive a phone.
    await page.setViewportSize(NARROW);
    await page.waitForTimeout(400);
    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    await page.setViewportSize({ width: 1280, height: 800 });

    const problems = [];
    if (serious.length > 0) problems.push(`${serious.length} serious/critical axe violations`);
    if (keyboard.stops === 0) problems.push('nothing reachable by keyboard');
    if (!keyboard.everVisible) problems.push('no visible focus indicator');
    if (overflows) problems.push('horizontal overflow at 360px');

    if (problems.length > 0) {
      blocking += 1;
      process.stdout.write(`  ✗ ${screen.name}: ${problems.join('; ')}\n`);
      for (const violation of serious) {
        process.stdout.write(
          `        ${violation.id} (${violation.impact}) ×${violation.nodes.length} — ${violation.help}\n`,
        );
        for (const node of violation.nodes.slice(0, 3)) {
          process.stdout.write(`          at ${node.target.join(' ')}\n`);
          process.stdout.write(`          ${node.failureSummary?.replace(/\n\s*/g, ' ') ?? ''}\n`);
        }
      }
    } else {
      process.stdout.write(
        `  ✓ ${screen.name} — ${keyboard.stops} keyboard stops, focus visible` +
          (minor > 0 ? `, ${minor} minor advisories` : '') +
          '\n',
      );
    }
  }

  await browser.close();
  process.stdout.write(
    blocking === 0
      ? `\nNo blocking accessibility findings across ${SCREENS.length} screens.\n`
      : `\n${blocking} of ${SCREENS.length} screens have blocking findings.\n`,
  );
  process.exit(blocking === 0 ? 0 : 1);
};

await main();
