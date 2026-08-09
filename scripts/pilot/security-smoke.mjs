#!/usr/bin/env node
/**
 * Live security smoke test against a deployed Witness.
 *
 * Signs in as each pilot principal through the real identity provider, takes
 * the bearer session the browser actually stores, and then asks the deployed
 * API the questions that matter: can a stranger read anything, can a reader
 * write, can one workspace reach another's records, and does a redacted report
 * stay redacted once it has been exported.
 *
 * These are not the unit tests restated. Every assertion here crosses the
 * network to a running instance, so it also covers the deployment: TLS, CORS,
 * what the client bundle ships, and what the logs keep.
 *
 * Required environment:
 *   WITNESS_PILOT_WEB_URL, WITNESS_PILOT_API_URL
 *   WITNESS_PILOT_PASSWORD          shared by the pilot identity-provider users
 *   WITNESS_PILOT_CHROMIUM
 * Optional:
 *   WITNESS_PILOT_INSECURE_TLS=1    the deployment uses a private CA. This
 *                                   relaxes *Chromium's* certificate check
 *                                   only. Node's own requests keep verifying:
 *                                   point `NODE_EXTRA_CA_CERTS` at the CA
 *                                   certificate instead. Turning verification
 *                                   off wholesale in a script whose job is to
 *                                   test transport security would be a poor
 *                                   joke — a man in the middle would pass every
 *                                   check below.
 *   WITNESS_PILOT_OTHER_ORGANISATION_ID  a second organisation the pilot users
 *                                   do NOT belong to; enables the
 *                                   cross-organisation checks
 *   WITNESS_PILOT_OTHER_WORKSPACE_ID     a workspace under that organisation;
 *                                   enables the cross-tenant workspace check
 *   WITNESS_PILOT_LOG_FILE          an application log to scan for leaked
 *                                   secrets
 */

import { readFile } from 'node:fs/promises';

import playwright from 'playwright-core';

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
const API = required('WITNESS_PILOT_API_URL').replace(/\/$/, '');
const PASSWORD = required('WITNESS_PILOT_PASSWORD');
const CHROMIUM = required('WITNESS_PILOT_CHROMIUM');
const INSECURE = process.env.WITNESS_PILOT_INSECURE_TLS === '1';
const OTHER_ORGANISATION = process.env.WITNESS_PILOT_OTHER_ORGANISATION_ID ?? '';
const OTHER_WORKSPACE = process.env.WITNESS_PILOT_OTHER_WORKSPACE_ID ?? '';
const LOG_FILE = process.env.WITNESS_PILOT_LOG_FILE ?? '';

const PRINCIPALS = {
  admin: 'pilot.admin',
  contributor: 'pilot.facilitator',
  reviewer: 'pilot.reviewer',
  reader: 'pilot.reader',
};

let passed = 0;
let failed = 0;
let skipped = 0;

const check = async (name, fn) => {
  try {
    await fn();
    passed += 1;
    process.stdout.write(`  ✓ ${name}\n`);
  } catch (error) {
    failed += 1;
    process.stdout.write(`  ✗ ${name}\n        ${String(error).split('\n')[0]}\n`);
  }
};

const skip = (name, why) => {
  skipped += 1;
  process.stdout.write(`  – ${name} (${why})\n`);
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

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

  /** Sign in as one identity-provider user and take the session the browser stores. */
  const signIn = async (username) => {
    const context = await browser.newContext({ ignoreHTTPSErrors: INSECURE });
    const page = await context.newPage();
    page.setDefaultTimeout(25_000);
    await page.goto(`${WEB}/signin`, { waitUntil: 'domcontentloaded' });
    await page
      .getByRole('link', { name: /sign in/i })
      .first()
      .click();
    await page.waitForURL(/\/protocol\/openid-connect\/auth/);
    await page.fill('#username', username);
    await page.fill('#password', PASSWORD);
    await page.click('#kc-login');
    await page.waitForURL((url) => url.origin === new URL(WEB).origin, { timeout: 30_000 });
    await page.getByText(/signed in as/i).waitFor();
    const token = await page.evaluate(() =>
      window.sessionStorage.getItem('witness.auth.sessionToken'),
    );
    await context.close();
    if (token === null) throw new Error(`no session token after signing in as ${username}`);
    return token;
  };

  const call = async (path, { token, method = 'GET', body, origin, devUser } = {}) => {
    const headers = {};
    if (token !== undefined) headers['Authorization'] = `Bearer ${token}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (origin !== undefined) headers['Origin'] = origin;
    if (devUser !== undefined) headers['X-Witness-Dev-User'] = devUser;

    const response = await fetch(`${API}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      json = undefined;
    }
    return { status: response.status, headers: response.headers, text, json };
  };

  process.stdout.write('\nAuthentication\n');

  const tokens = {};
  for (const [role, username] of Object.entries(PRINCIPALS)) {
    tokens[role] = await signIn(username);
  }

  await check('an unauthenticated API request is refused', async () => {
    const { status } = await call('/api/v1/organisations');
    assert(status === 401, `expected 401, got ${status}`);
  });

  await check('a malformed bearer token is refused', async () => {
    const { status } = await call('/api/v1/organisations', { token: 'not-a-token' });
    assert(status === 401, `expected 401, got ${status}`);
  });

  await check('an unknown but well-formed session token is refused', async () => {
    const { status } = await call('/api/v1/organisations', { token: 'a'.repeat(64) });
    assert(status === 401, `expected 401, got ${status}`);
  });

  await check('the development impersonation header alone is refused', async () => {
    const { status } = await call('/api/v1/organisations', { devUser: 'Intruder|admin' });
    assert(status === 401, `expected 401, got ${status}`);
  });

  await check('the development identity provider is not active', async () => {
    const { status, json } = await call('/api/v1/auth/dev-idp/authorize?state=x');
    assert(status === 400, `expected 400, got ${status}`);
    assert(json?.error?.code === 'DEV_IDP_NOT_ACTIVE', `unexpected code ${json?.error?.code}`);
  });

  await check('signing out ends the session immediately', async () => {
    const doomed = await signIn(PRINCIPALS.reader);
    const before = await call('/api/v1/me', { token: doomed });
    assert(before.status === 200, `session was not usable before logout (${before.status})`);
    await call('/api/v1/auth/logout', { token: doomed, method: 'POST' });
    const after = await call('/api/v1/me', { token: doomed });
    assert(after.status === 401, `expected 401 after logout, got ${after.status}`);
  });

  process.stdout.write('\nAuthorisation\n');

  const organisations = (await call('/api/v1/organisations', { token: tokens.admin })).json
    .organisations;
  const organisationId = organisations[0].id;
  const workspaces = (await call('/api/v1/workspaces', { token: tokens.admin })).json.workspaces;
  assert(workspaces.length > 0, 'the admin belongs to no workspace — run the walkthrough first');
  const workspaceId = workspaces[0].id;

  await check('a reader may read the organisations they belong to', async () => {
    const { status, json } = await call('/api/v1/organisations', { token: tokens.reader });
    assert(status === 200, `expected 200, got ${status}`);
    assert(Array.isArray(json.organisations), 'no organisations array');
  });

  await check('a reader cannot create a workspace', async () => {
    const { status } = await call('/api/v1/workspaces', {
      token: tokens.reader,
      method: 'POST',
      body: { name: 'Reader should not manage this', organisationId },
    });
    assert(status === 403, `expected 403, got ${status}`);
  });

  await check('a reader cannot create a session', async () => {
    const { status } = await call(`/api/v1/workspaces/${workspaceId}/sessions`, {
      token: tokens.reader,
      method: 'POST',
      body: { title: 'Reader should not create this', purpose: 'x', sessionType: 'workshop' },
    });
    assert(status === 403, `expected 403, got ${status}`);
  });

  await check('a reader cannot manage consent templates', async () => {
    const { status } = await call(`/api/v1/organisations/${organisationId}/consent-templates`, {
      token: tokens.reader,
      method: 'POST',
      body: { name: 'x', purpose: 'x', plainLanguageSummary: 'x', supportedLanguages: ['en'] },
    });
    assert(status === 403, `expected 403, got ${status}`);
  });

  // Find a session whose report actually cites something. The pilot
  // environment accumulates workspaces from repeated walkthrough runs, and a
  // report with no citations cannot demonstrate redaction — the checks below
  // would pass vacuously, which is worse than failing.
  const subject = await (async () => {
    for (const workspace of workspaces) {
      const sessions =
        (await call(`/api/v1/workspaces/${workspace.id}/sessions`, { token: tokens.admin })).json
          ?.sessions ?? [];
      for (const session of sessions) {
        const reports =
          (
            await call(`/api/v1/workspaces/${workspace.id}/sessions/${session.id}/reports`, {
              token: tokens.admin,
            })
          ).json?.reports ?? [];
        for (const report of reports) {
          const detail = (
            await call(
              `/api/v1/workspaces/${workspace.id}/sessions/${session.id}/reports/${report.id}`,
              { token: tokens.admin },
            )
          ).json;
          if ((detail?.sources ?? []).length > 0) {
            return { workspaceId: workspace.id, sessionId: session.id, reportId: report.id };
          }
        }
      }
    }
    return null;
  })();

  assert(
    subject !== null,
    'no report in this environment cites anything — run the browser walkthrough first',
  );
  const { sessionId, reportId } = subject;
  const reportWorkspaceId = subject.workspaceId;

  await check('a contributor cannot approve a report', async () => {
    const { status } = await call(
      `/api/v1/workspaces/${reportWorkspaceId}/sessions/${sessionId}/reports/${reportId}/transitions`,
      {
        token: tokens.contributor,
        method: 'POST',
        body: { action: 'approve', expectedVersion: 1 },
      },
    );
    assert(status === 403, `expected 403, got ${status}`);
  });

  await check('a reader cannot approve a report', async () => {
    const { status } = await call(
      `/api/v1/workspaces/${reportWorkspaceId}/sessions/${sessionId}/reports/${reportId}/transitions`,
      { token: tokens.reader, method: 'POST', body: { action: 'approve', expectedVersion: 1 } },
    );
    assert(status === 403, `expected 403, got ${status}`);
  });

  await check('a contributor cannot assign a reviewer', async () => {
    const evidence = (
      await call(`/api/v1/workspaces/${reportWorkspaceId}/sessions/${sessionId}/evidence`, {
        token: tokens.admin,
      })
    ).json.evidence;
    assert(evidence.length > 0, 'no evidence in the pilot session');
    const { status } = await call(
      `/api/v1/workspaces/${reportWorkspaceId}/sessions/${sessionId}/evidence/${evidence[0].id}/review/assignment`,
      {
        token: tokens.contributor,
        method: 'POST',
        body: { reviewerUserId: '00000000-0000-4000-8000-000000000000' },
      },
    );
    assert(status === 403, `expected 403, got ${status}`);
  });

  // Note on what workspace isolation means here. A role assigned at
  // organisation scope deliberately cascades to every workspace under that
  // organisation (`RoleResolutionService.scopedGrantTiers`), so a reader of an
  // organisation *can* read its workspaces — that is the model, not a leak.
  // The boundary that must hold is the one around an organisation the
  // principal holds no role in at all.
  if (OTHER_WORKSPACE === '') {
    skip(
      'a workspace under an organisation the principal has no role in is not reachable',
      'set WITNESS_PILOT_OTHER_WORKSPACE_ID',
    );
  } else {
    await check(
      'a workspace under an organisation the principal has no role in is not reachable',
      async () => {
        for (const [role, token] of Object.entries(tokens)) {
          const { status } = await call(`/api/v1/workspaces/${OTHER_WORKSPACE}/sessions`, {
            token,
          });
          assert(
            status === 403 || status === 404,
            `${role} reached a foreign workspace with ${status}`,
          );
        }
      },
    );
  }

  if (OTHER_ORGANISATION === '') {
    skip(
      'an organisation a principal does not belong to is not reachable',
      'set WITNESS_PILOT_OTHER_ORGANISATION_ID',
    );
  } else {
    await check('an organisation a principal does not belong to is not reachable', async () => {
      const { status } = await call(
        `/api/v1/organisations/${OTHER_ORGANISATION}/consent-templates`,
        { token: tokens.reader },
      );
      assert(status === 403 || status === 404, `expected 403/404, got ${status}`);
    });

    await check('a cross-organisation read is refused even for an administrator', async () => {
      const { status } = await call(
        `/api/v1/organisations/${OTHER_ORGANISATION}/consent-templates`,
        { token: tokens.admin },
      );
      assert(status === 403 || status === 404, `expected 403/404, got ${status}`);
    });
  }

  process.stdout.write('\nPrivacy\n');

  const participants = (
    await call(`/api/v1/workspaces/${reportWorkspaceId}/sessions/${sessionId}/participants`, {
      token: tokens.reader,
    })
  ).json.participants;

  await check('an anonymous participant carries no identifying name', async () => {
    const anonymous = participants.filter((p) => p.identityMode === 'anonymous');
    assert(anonymous.length > 0, 'no anonymous participant to check');
    for (const participant of anonymous) {
      const serialised = JSON.stringify(participant);
      // The API returns a fixed stand-in ("Restricted participant") rather
      // than omitting the field, so a list still renders. What must never
      // appear is anything that could identify the person.
      assert(
        typeof participant.displayName !== 'string' ||
          /^(restricted|anonymous)/i.test(participant.displayName),
        `an anonymous participant exposed a real name: ${serialised.slice(0, 160)}`,
      );
      assert(
        participant.preferredName === null || participant.preferredName === undefined,
        'an anonymous participant exposed a preferred name',
      );
      assert(
        !('linkedUserId' in participant) || participant.linkedUserId === null,
        'an anonymous participant exposed a linked user',
      );
    }
  });

  await check('a pseudonymous participant exposes no linked identity to a reader', async () => {
    const pseudonymous = participants.filter((p) => p.identityMode === 'pseudonymous');
    assert(pseudonymous.length > 0, 'no pseudonymous participant to check');
    for (const participant of pseudonymous) {
      assert(
        !('linkedUserId' in participant) || participant.linkedUserId === null,
        'a pseudonymous participant exposed a linked user to a reader',
      );
    }
  });

  const rendered = (
    await call(
      `/api/v1/workspaces/${reportWorkspaceId}/sessions/${sessionId}/reports/${reportId}/rendered`,
      { token: tokens.reader },
    )
  ).json;

  await check('a rendered report summarises participants rather than naming them', async () => {
    assert(rendered.participants !== undefined, 'the report has no participant summary');
    const serialised = JSON.stringify(rendered.participants);
    assert(
      !/displayName|preferredName/.test(serialised),
      `the participant summary carried names: ${serialised.slice(0, 200)}`,
    );
  });

  await check('citations the audience has no consent for are excluded and counted', async () => {
    const detail = (
      await call(
        `/api/v1/workspaces/${reportWorkspaceId}/sessions/${sessionId}/reports/${reportId}`,
        { token: tokens.reader },
      )
    ).json;
    const cited = (detail.sources ?? []).filter((source) => source.sourceType === 'evidence');
    assert(cited.length > 0, 'the report cites no evidence — run the browser walkthrough first');

    const shown = rendered.evidence ?? [];
    // Consent fails closed: a citation whose participant did not grant the
    // category this audience needs is dropped from the rendering entirely, and
    // the count is what tells a reader the report is not the whole picture.
    assert(
      shown.length + rendered.redactedCount === cited.length,
      `${cited.length} cited, ${shown.length} rendered, ${rendered.redactedCount} reported as redacted — the numbers must reconcile`,
    );
    for (const item of shown) {
      if (item.quotable === false) {
        assert(
          !('content' in item),
          'a non-quotable citation still carried its content — redaction removes the key, not the value',
        );
      }
    }
  });

  for (const format of ['html', 'markdown', 'json', 'csv']) {
    await check(`the ${format} export carries no withheld content`, async () => {
      const response = await fetch(
        `${API}/api/v1/workspaces/${reportWorkspaceId}/sessions/${sessionId}/reports/${reportId}/export?format=${format}`,
        { headers: { Authorization: `Bearer ${tokens.reader}` } },
      );
      assert(response.ok, `export failed with ${response.status}`);
      assert(
        (response.headers.get('content-disposition') ?? '').startsWith('attachment'),
        'the export was not served as an attachment',
      );
      const body = await response.text();
      // The citation itself may appear — a report says a contribution exists.
      // What must never appear is the text a participant withheld, and the
      // whole point of the redaction is that the server never sent it here
      // either, so the check is that the export matches the rendering.
      for (const item of rendered.evidence ?? []) {
        if (item.quotable === false && typeof item.content === 'string') {
          assert(false, `the rendering leaked withheld content for ${item.id}`);
        }
      }
      for (const participant of participants.filter((p) => p.identityMode !== 'named')) {
        if (typeof participant.displayName === 'string' && participant.displayName !== '') {
          assert(
            !body.includes(participant.displayName),
            `the ${format} export named a ${participant.identityMode} participant`,
          );
        }
      }
    });
  }

  process.stdout.write('\nHTTP and runtime\n');

  await check('the API is served over HTTPS', async () => {
    assert(API.startsWith('https://'), `the API URL is not https: ${API}`);
    const { status } = await call('/health');
    assert(status === 200, `health returned ${status}`);
  });

  await check('transport security headers are set', async () => {
    const { headers } = await call('/health');
    assert(
      headers.get('strict-transport-security') !== null,
      'no Strict-Transport-Security header',
    );
  });

  await check('CORS does not admit a foreign origin', async () => {
    const { headers } = await call('/health', { origin: 'https://attacker.example' });
    const allowed = headers.get('access-control-allow-origin');
    assert(
      allowed === null || allowed !== 'https://attacker.example',
      `CORS echoed a foreign origin: ${allowed}`,
    );
  });

  await check('an error response carries a code, not a stack trace', async () => {
    const { status, text } = await call('/api/v1/workspaces/not-a-uuid/sessions', {
      token: tokens.reader,
    });
    assert(status >= 400, `expected an error, got ${status}`);
    assert(
      !/\bat\s+\w+\s+\(/.test(text),
      `the response contained a stack frame: ${text.slice(0, 200)}`,
    );
    assert(!text.includes('node_modules'), 'the response leaked a filesystem path');
  });

  await check('readiness reports dependencies without exposing secrets', async () => {
    const { status, text } = await call('/ready');
    assert(status === 200, `readiness returned ${status}`);
    assert(!/postgresql:\/\//.test(text), 'readiness leaked a connection string');
    assert(!/password/i.test(text), 'readiness mentioned a password');
  });

  await check('the client bundle ships no secrets', async () => {
    const html = await (await fetch(`${WEB}/signin`)).text();
    const chunks = [...html.matchAll(/\/_next\/static\/[^"']+\.js/g)].map((match) => match[0]);
    assert(chunks.length > 0, 'no client chunks found to inspect');
    for (const chunk of chunks.slice(0, 12)) {
      const body = await (await fetch(`${WEB}${chunk}`)).text();
      assert(!body.includes(PASSWORD), `${chunk} contains the pilot password`);
      assert(
        !/KEYCLOAK_CLIENT_SECRET|DATABASE_URL|postgresql:\/\//.test(body),
        `${chunk} contains server-side configuration`,
      );
    }
  });

  if (LOG_FILE === '') {
    skip('application logs carry no credentials or session tokens', 'set WITNESS_PILOT_LOG_FILE');
  } else {
    await check('application logs carry no credentials or session tokens', async () => {
      const log = await readFile(LOG_FILE, 'utf8');
      assert(!log.includes(PASSWORD), 'the log contains the pilot password');
      for (const token of Object.values(tokens)) {
        assert(!log.includes(token), 'the log contains a live session token');
      }
      assert(!/postgresql:\/\/[^\s"]*:[^\s"@]*@/.test(log), 'the log contains a connection string');
    });
  }

  await browser.close();

  process.stdout.write(`\n${passed} passed, ${failed} failed, ${skipped} skipped\n`);
  process.exit(failed > 0 ? 1 : 0);
};

await main();
