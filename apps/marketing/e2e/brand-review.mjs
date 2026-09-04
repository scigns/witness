import { mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import process from 'node:process';
import { chromium } from 'playwright-core';

const port = Number(process.env.WITNESS_MARKETING_PORT ?? 3002);
const remoteBaseURL = process.env.WITNESS_MARKETING_E2E_BASE_URL?.replace(/\/$/, '');
const baseURL = remoteBaseURL ?? `http://127.0.0.1:${port}`;
const chromePath =
  process.env.WITNESS_MARKETING_CHROMIUM ??
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const viewports = [320, 375, 430, 768, 1024, 1440];
const artifacts = process.env.MKT_E2E_ARTIFACT_DIR ?? '/tmp/witness-marketing-e2e';

async function waitForServer() {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseURL}/health`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Marketing server did not become ready at ${baseURL}`);
}

function startServer() {
  return spawn('pnpm', ['dev'], {
    cwd: new URL('..', import.meta.url),
    env: { ...process.env, WITNESS_MARKETING_PORT: String(port) },
    stdio: 'ignore',
  });
}

async function assertPage(page, width, path) {
  await page.setViewportSize({ width, height: 900 });
  const response = await page.goto(`${baseURL}${path}`, { waitUntil: 'domcontentloaded' });
  if (!response || !response.ok())
    throw new Error(`${path} returned HTTP ${response?.status() ?? 'unknown'}`);

  const state = await page.evaluate(() => {
    const logo = document.querySelector('.brand-logo');
    return {
      pageWidth: document.documentElement.scrollWidth,
      viewportWidth: document.documentElement.clientWidth,
      headings: document.querySelectorAll('h1').length,
      header: Boolean(document.querySelector('header')),
      main: Boolean(document.querySelector('main')),
      footer: Boolean(document.querySelector('footer')),
      logoVisible: Boolean(logo && logo.complete && logo.naturalWidth > 0),
      logoNaturalRatio: logo && logo.naturalHeight > 0 ? logo.naturalWidth / logo.naturalHeight : 0,
      logoObjectFit: logo ? getComputedStyle(logo).objectFit : '',
      logoFilter: logo ? getComputedStyle(logo).filter : '',
      desktopNav: getComputedStyle(document.querySelector('.desktop-navigation')).display,
      mobileNav: getComputedStyle(document.querySelector('.mobile-navigation')).display,
      provenanceNodes: document.querySelectorAll('.provenance-node').length,
    };
  });

  if (state.pageWidth > state.viewportWidth) {
    throw new Error(
      `${path} overflows at ${width}px (${state.pageWidth} > ${state.viewportWidth})`,
    );
  }
  if (!state.header || !state.main || !state.footer || state.headings !== 1) {
    throw new Error(`${path} landmark or heading contract failed at ${width}px`);
  }
  if (!state.logoVisible || state.logoNaturalRatio <= 0 || state.logoObjectFit !== 'contain') {
    throw new Error(
      `${path} logo contract failed at ${width}px (visible=${state.logoVisible}, natural=${state.logoNaturalRatio}, fit=${state.logoObjectFit})`,
    );
  }
  if (state.logoFilter !== 'none') throw new Error(`${path} applies a logo filter`);
  if (path === '/brand-fixture' && state.provenanceNodes < 14) {
    throw new Error(`Provenance fixture incomplete at ${width}px (${state.provenanceNodes} nodes)`);
  }

  const isMobile = width < 992;
  if (isMobile && state.mobileNav !== 'block') throw new Error(`Mobile menu missing at ${width}px`);
  if (!isMobile && state.desktopNav === 'none')
    throw new Error(`Desktop nav missing at ${width}px`);

  if (isMobile) await page.locator('.mobile-navigation summary').click();

  for (const label of ['Book a demo', 'Sign in']) {
    const scope = isMobile ? page.locator('.mobile-navigation') : page.locator('.header-actions');
    const locator = scope.getByText(label, { exact: true });
    if (!(await locator.isVisible())) throw new Error(`${label} is not visible at ${width}px`);
  }
}

async function assertKeyboard(page) {
  await page.setViewportSize({ width: 375, height: 900 });
  await page.goto(`${baseURL}/`, { waitUntil: 'domcontentloaded' });
  await page.keyboard.press('Tab');
  if ((await page.locator(':focus').getAttribute('class')) !== 'skip-link') {
    throw new Error('First keyboard stop is not the skip link');
  }
  for (let index = 0; index < 12; index += 1) {
    if (await page.locator('header .logo-link').evaluate((node) => node === document.activeElement))
      break;
    await page.keyboard.press('Tab');
  }
  if (
    !(await page.locator('header .logo-link').evaluate((node) => node === document.activeElement))
  ) {
    throw new Error('Logo home link is not in keyboard order');
  }
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  if (!(await page.locator('main').evaluate((node) => node === document.activeElement))) {
    throw new Error('Skip link did not focus main content');
  }
  await page.locator('main').focus();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  const summary = page.locator('.mobile-navigation summary');
  await summary.focus();
  await page.keyboard.press('Enter');
  if (!(await page.locator('.mobile-navigation').evaluate((node) => node.hasAttribute('open')))) {
    throw new Error('Mobile menu is not keyboard operable');
  }
  for (const label of ['Sign in', 'Book a demo']) {
    if (!(await page.locator('.mobile-navigation').getByText(label, { exact: true }).isVisible())) {
      throw new Error(`${label} is not reachable in the mobile menu`);
    }
  }
}

const server = remoteBaseURL === undefined ? startServer() : undefined;
let browser;
try {
  await mkdir(artifacts, { recursive: true });
  await waitForServer();
  browser = await chromium.launch({ executablePath: chromePath, headless: true });
  const page = await browser.newPage();
  for (const width of viewports) {
    await assertPage(page, width, '/');
    await page.screenshot({ path: `${artifacts}/home-${width}.png`, fullPage: true });
    await assertPage(page, width, '/brand-fixture');
    await page.screenshot({ path: `${artifacts}/brand-${width}.png`, fullPage: true });
  }
  await assertKeyboard(page);
  console.log(
    `Marketing browser review passed at ${viewports.join(', ')}px; screenshots: ${artifacts}`,
  );
} catch (error) {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
} finally {
  await browser?.close();
  server?.kill('SIGTERM');
}
