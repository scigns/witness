import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';

const baseURL = (process.env.WITNESS_WEB_E2E_BASE_URL ?? 'http://127.0.0.1:3020').replace(/\/$/, '');
const artifacts = process.env.WITNESS_WEB_E2E_ARTIFACT_DIR ?? '/tmp/witness-web-brand-e2e';
const executablePath =
  process.env.WITNESS_WEB_CHROMIUM ??
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const widths = [320, 375, 430, 768, 1024, 1440];
const routes = ['/', '/signin', '/pricing'];

await mkdir(artifacts, { recursive: true });
const browser = await chromium.launch({ executablePath, headless: true });

try {
  for (const width of widths) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await context.newPage();
    for (const route of routes) {
      const response = await page.goto(`${baseURL}${route}`, { waitUntil: 'domcontentloaded' });
      if (!response?.ok()) throw new Error(`${route} returned ${response?.status()}`);
      await page.waitForTimeout(500);
      await page.locator('h1').first().waitFor({ state: 'attached', timeout: 5_000 });
      const result = await page.evaluate(() => ({
        h1: document.querySelectorAll('h1').length,
        header: Boolean(document.querySelector('header')),
        main: Boolean(document.querySelector('main')),
        footer: Boolean(document.querySelector('footer')),
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        bodyFont: getComputedStyle(document.body).fontFamily,
        headingFont: getComputedStyle(document.querySelector('h1')).fontFamily,
        background: getComputedStyle(document.body).backgroundColor,
      }));
      if (result.h1 !== 1 || !result.header || !result.main || !result.footer || result.overflow)
        throw new Error(`${route} failed structure at ${width}px: ${JSON.stringify(result)}`);
      if (!result.bodyFont.includes('plexSans') || !result.headingFont.includes('newsreader'))
        throw new Error(`${route} failed typography at ${width}px: ${JSON.stringify(result)}`);
      if (result.background !== 'rgb(245, 242, 237)')
        throw new Error(`${route} failed Bone background at ${width}px`);
      await page.screenshot({
        path: `${artifacts}/${route === '/' ? 'home' : route.slice(1)}-${width}.png`,
        fullPage: true,
      });
    }
    await context.close();
  }
} finally {
  await browser.close();
}

console.log(
  `Witness product brand review passed at ${widths.join(', ')}px; screenshots: ${artifacts}`,
);
