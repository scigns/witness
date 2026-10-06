/** Local hybrid-profile browser acceptance with mocked API; never a production/OIDC gate. */
import { chromium } from 'playwright-core';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const axe = require.resolve('axe-core/axe.min.js');
const browser = await chromium.launch({
  executablePath:
    process.env.WITNESS_WEB_CHROMIUM ??
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
});
const base = process.env.WITNESS_WEB_E2E_BASE_URL ?? 'http://127.0.0.1:3047';
const user = {
  id: 'test-user',
  displayName: 'Synthetic Client',
  email: 'synthetic@example.invalid',
  bio: null,
  accountState: 'active',
  operatorAccess: false,
  organisations: [{ id: 'org-test', name: 'Synthetic Organisation', role: 'reader' }],
  workspaces: [],
};
let checks = 0;
try {
  for (const width of [375, 768, 1440]) {
    for (const role of ['unauthenticated', 'reader', 'admin', 'operator']) {
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      const page = await context.newPage();
      await page.route('https://api.rehearsal.invalid/**', async (route) => {
        const path = new URL(route.request().url()).pathname;
        let status = 200,
          body = {};
        if (path === '/api/v1/me') {
          if (role === 'unauthenticated') {
            status = 401;
            body = { error: { code: 'UNAUTHENTICATED', message: 'Sign in required' } };
          } else {
            body = {
              ...user,
              operatorAccess: role === 'operator',
              organisations: [
                { ...user.organisations[0], role: role === 'admin' ? 'admin' : 'reader' },
              ],
            };
          }
        } else if (path === '/api/v1/workspaces') body = { workspaces: [] };
        else if (path === '/api/v1/organisations') body = { organisations: user.organisations };
        else if (path === '/health' || path === '/ready')
          body = { status: 'ok', profile: 'hybrid' };
        await route.fulfill({
          status,
          contentType: 'application/json',
          body: JSON.stringify(body),
          headers: {
            'Access-Control-Allow-Origin': base,
            'Access-Control-Allow-Credentials': 'true',
          },
        });
      });
      const target = '/workspaces?tab=sessions#evidence';
      await page.goto(base + target);
      if (role === 'unauthenticated') {
        await page.waitForURL('**/signin?returnTo=**');
        const returnTo = new URL(page.url()).searchParams.get('returnTo');
        if (returnTo !== target) throw Error('deep link lost: ' + returnTo);
        const login = page.getByRole('main').getByRole('link', { name: 'Sign in', exact: true });
        await login.waitFor();
        const href = await login.getAttribute('href');
        if (new URL(href).searchParams.get('returnTo') !== target)
          throw Error('login link lost target');
      } else {
        await page.getByRole('heading', { name: 'Programs', exact: true }).waitFor();
        await page.getByText('No programs yet', { exact: true }).waitFor();
        if (
          (await page.getByRole('link', { name: 'Create program', exact: true }).count()) !==
          (role === 'admin' ? 2 : 0)
        )
          throw Error('create permission mismatch ' + role);
        if (
          (await page.getByRole('link', { name: 'Operator', exact: true }).count()) !==
          (role === 'operator' ? 1 : 0)
        )
          throw Error('operator permission mismatch ' + role);
        if (
          await page
            .getByRole('navigation', { name: 'Primary' })
            .getByRole('link', { name: 'Pricing' })
            .count()
        )
          throw Error('pricing primary navigation');
      }
      if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth))
        throw Error('horizontal overflow ' + width + ' ' + role);
      await page.addScriptTag({ path: axe });
      const violations = await page.evaluate(async () =>
        (
          await axe.run(document, {
            runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] },
          })
        ).violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length })),
      );
      if (violations.length)
        throw Error('accessibility ' + width + ' ' + role + ' ' + JSON.stringify(violations));
      if (process.env.WITNESS_WEB_E2E_ARTIFACT_DIR)
        await page.screenshot({
          path: `${process.env.WITNESS_WEB_E2E_ARTIFACT_DIR}/frontend-${role}-${width}.png`,
          fullPage: true,
        });
      checks++;
      await context.close();
    }
  }
  console.log(
    JSON.stringify({
      checks,
      viewports: [375, 768, 1440],
      scope: 'local hybrid-profile web with mocked API; not OIDC or production proof',
      result: 'PASS',
    }),
  );
} finally {
  await browser.close();
}
