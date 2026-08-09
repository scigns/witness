#!/usr/bin/env node
/**
 * The internal-pilot browser walkthrough.
 *
 * `scripts/pilot/walkthrough.mjs` drives the same workflow over HTTP. This one
 * drives it through the deployed web application in a real browser, which is a
 * different claim: it exercises the sign-in redirect, the bearer session the
 * frontend actually stores, every form's validation, and the screens an
 * institution's staff will use. An API-level pass says the rules hold; only
 * this says a person can reach them.
 *
 * Deliberately not a Playwright test file. It is an operator's acceptance run —
 * it prints a numbered pass/fail line per step, stops at the first failure, and
 * dumps the failing page's headings, labels and buttons so the next run is
 * informed rather than guessed.
 *
 * Required environment:
 *   WITNESS_PILOT_WEB_URL     e.g. https://pilot.example.org
 *   WITNESS_PILOT_USERNAME    an identity-provider username
 *   WITNESS_PILOT_PASSWORD    that user's password (never hard-coded here)
 *   WITNESS_PILOT_CHROMIUM    path to a Chromium binary
 * Optional:
 *   WITNESS_PILOT_INSECURE_TLS=1   accept a private CA (internal pilots)
 *   WITNESS_PILOT_HEADFUL=1        watch it run
 *   WITNESS_PILOT_INVENTORY=1      dump every page, not only failures
 */

import { stat } from 'node:fs/promises';

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
const USERNAME = required('WITNESS_PILOT_USERNAME');
const PASSWORD = required('WITNESS_PILOT_PASSWORD');
const CHROMIUM = required('WITNESS_PILOT_CHROMIUM');
const INSECURE = process.env.WITNESS_PILOT_INSECURE_TLS === '1';
const ALWAYS_INVENTORY = process.env.WITNESS_PILOT_INVENTORY === '1';

const stamp = Date.now().toString(36);
const unique = (prefix) => `${prefix} ${stamp}`;

let stepNumber = 0;
let passed = 0;

const main = async () => {
  const browser = await chromium.launch({
    executablePath: CHROMIUM,
    headless: process.env.WITNESS_PILOT_HEADFUL !== '1',
    args: [
      '--no-sandbox',
      '--no-proxy-server',
      ...(INSECURE ? ['--ignore-certificate-errors'] : []),
    ],
  });
  const context = await browser.newContext({
    ignoreHTTPSErrors: INSECURE,
    acceptDownloads: true,
  });
  const page = await context.newPage();
  page.setDefaultTimeout(20_000);

  const consoleErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  // Every refused API call, with its body. A screen that renders an empty list
  // looks identical whether the request was denied, returned nothing, or was
  // never made; this is how the run tells them apart.
  const apiFailures = [];
  page.on('response', async (response) => {
    if (response.status() < 400) return;
    let body = '';
    try {
      body = (await response.text()).slice(0, 240);
    } catch {
      body = '<unreadable>';
    }
    apiFailures.push(
      `${response.status()} ${response.request().method()} ${response.url()} — ${body}`,
    );
  });

  /** What is on this page, in the terms a screen reader would use. */
  const describe = async () => {
    const inventory = await page.evaluate(() => {
      const text = (node) =>
        (node.innerText ?? node.value ?? '').trim().replace(/\s+/g, ' ').slice(0, 70);
      return {
        url: location.href,
        headings: [...document.querySelectorAll('h1,h2,h3')].map(text),
        labels: [...document.querySelectorAll('label')].map((l) => `${l.htmlFor}: ${text(l)}`),
        buttons: [...document.querySelectorAll('button')].map(text),
        links: [...document.querySelectorAll('a')].map(text).slice(0, 50),
        selects: [...document.querySelectorAll('select')].map((s) => ({
          id: s.id,
          options: [...s.options].map((o) => o.value),
        })),
        radiosAndChecks: [
          ...document.querySelectorAll('input[type=radio],input[type=checkbox]'),
        ].map((i) => `${i.name}=${i.value}`),
      };
    });
    process.stdout.write(`\n--- page inventory ---\n${JSON.stringify(inventory, null, 1)}\n`);
  };

  const step = async (name, fn) => {
    stepNumber += 1;
    const label = String(stepNumber).padStart(2, '0');
    try {
      await fn();
      passed += 1;
      process.stdout.write(`  ✓ ${label}  ${name}\n`);
      if (ALWAYS_INVENTORY) await describe();
    } catch (error) {
      process.stdout.write(`  ✗ ${label}  ${name}\n        ${String(error).split('\n')[0]}\n`);
      await describe().catch(() => {});
      throw error;
    }
  };

  /** Wait for a `<select>` to be populated with something choosable. */
  const chooseFirst = async (id) => {
    await page.waitForFunction((selector) => {
      const element = document.querySelector(selector);
      return (
        element !== null &&
        !element.disabled &&
        [...element.options].some((option) => option.value !== '')
      );
    }, `#${id}`);
    const value = await page.$eval(
      `#${id}`,
      (element) => [...element.options].find((option) => option.value !== '').value,
    );
    await page.selectOption(`#${id}`, value);
    return value;
  };

  const submit = async (pattern) => {
    try {
      await page.getByRole('button', { name: pattern }).first().click();
    } catch (error) {
      const available = await page
        .$$eval('button', (buttons) =>
          buttons.map(
            (button) => `${button.innerText.trim()}${button.disabled ? ' [disabled]' : ''}`,
          ),
        )
        .catch(() => []);
      throw new Error(
        `clicking ${pattern}: ${String(error).split('\n')[0]} — buttons present: ${available.join(' | ')}`,
      );
    }
  };

  /**
   * Do something, and insist the API call it triggers actually succeeded.
   * Asserting on a success message instead would pass on any screen that
   * happens to contain the word.
   */
  const expectOk = async (urlPattern, action) => {
    const [response] = await Promise.all([
      page.waitForResponse(
        (candidate) => urlPattern.test(candidate.url()) && candidate.request().method() !== 'GET',
      ),
      action(),
    ]);
    if (!response.ok()) {
      const body = await response.text().catch(() => '<unreadable>');
      throw new Error(
        `${response.status()} ${response.request().method()} ${response.url()} — ${body.slice(0, 300)}`,
      );
    }
    return response;
  };

  /**
   * Drive one outcome-register lifecycle action.
   *
   * Some actions need input (a reason, a percentage) and open a panel with a
   * "Confirm …" button; the rest fire on the first click. Watching for the
   * request before clicking covers both without the caller having to know
   * which kind it just pressed.
   */
  const outcomeAction = async (label, fillPanel) => {
    const pending = page.waitForResponse(
      (candidate) =>
        candidate.request().method() !== 'GET' &&
        /\/(decisions|commitments|actions)\//.test(candidate.url()),
      { timeout: 25_000 },
    );
    await submit(label);

    const confirm = page.getByRole('button', { name: /^confirm /i });
    if ((await confirm.count()) > 0) {
      if (fillPanel !== undefined) await fillPanel();
      await confirm.first().click();
    }

    const response = await pending;
    if (!response.ok()) {
      const body = await response.text().catch(() => '<unreadable>');
      throw new Error(`${response.status()} ${response.url()} — ${body.slice(0, 240)}`);
    }
  };

  /** Radio groups whose name starts with `prefix`, and whether each is optional. */
  const radioGroups = async (prefix) =>
    page.evaluate((wanted) => {
      const groups = new Map();
      for (const input of document.querySelectorAll('input[type=radio]')) {
        if (!input.name.startsWith(wanted) || groups.has(input.name)) continue;
        const row = input.closest('li,tr,div');
        groups.set(input.name, /\(optional\)/i.test(row?.innerText ?? ''));
      }
      return [...groups].map(([name, optional]) => ({ name, optional }));
    }, prefix);

  const state = {};

  try {
    // ── Identity ───────────────────────────────────────────────────────────
    await step('log in through the identity provider', async () => {
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
    });

    await step('select organisation and workspace', async () => {
      await page.goto(`${WEB}/workspaces/new`, { waitUntil: 'domcontentloaded' });
      state.organisationId = await chooseFirst('organisationId');
      await page.fill('#name', unique('Pilot Workspace'));
      await submit(/create/i);
      await page.waitForURL(/\/workspaces/);
      await page
        .getByRole('link', { name: new RegExp(unique('Pilot Workspace')) })
        .first()
        .click();
      await page.waitForURL(/\/workspaces\/[0-9a-f-]{36}/);
      state.workspaceId = page.url().match(/\/workspaces\/([0-9a-f-]{36})/)[1];
    });

    // A workspace starts with no members, and a session needs a facilitator
    // drawn from them. Joining the workspace is part of selecting it, not a
    // separate workflow step.
    await step('join the workspace so a facilitator exists', async () => {
      await chooseFirst('userId');
      await submit(/add to workspace/i);
      await page
        .getByRole('heading', { name: /members/i })
        .first()
        .waitFor();
    });

    // ── Session ────────────────────────────────────────────────────────────
    await step('create a co-design session', async () => {
      await page.goto(`${WEB}/workspaces/${state.workspaceId}/sessions/new`, {
        waitUntil: 'domcontentloaded',
      });
      await page.fill('#title', unique('Pilot Session'));
      await page.fill('#purpose', 'Verify the deployed application end to end before the pilot.');
      await chooseFirst('sessionType');
      await chooseFirst('deliveryMode');
      await submit(/create|schedule/i);
      await page.waitForURL(/\/sessions\/[0-9a-f-]{36}/);
      state.sessionId = page.url().match(/\/sessions\/([0-9a-f-]{36})/)[1];
    });

    const participantsUrl = `${WEB}/workspaces/${state.workspaceId}/sessions/${state.sessionId}/participants`;

    const addParticipant = async (identityMode, displayName) => {
      await page.goto(`${participantsUrl}/new`, { waitUntil: 'domcontentloaded' });
      await page.selectOption('#identityMode', identityMode);
      if (identityMode !== 'anonymous') await page.fill('#displayName', displayName);
      await chooseFirst('participantType');
      await chooseFirst('participationMode');
      await submit(/add|create/i);
      await page.waitForURL(/\/participants/);
    };

    await step('add a named participant', () => addParticipant('named', unique('Named Person')));
    await step('add a pseudonymous participant', () =>
      addParticipant('pseudonymous', unique('Pseudonym')),
    );
    await step('add an anonymous participant', () => addParticipant('anonymous', ''));

    // ── Consent ────────────────────────────────────────────────────────────
    await step('configure consent for the session', async () => {
      // A session's consent configuration binds an *active* organisation
      // template, so the template has to exist and be activated first.
      await page.goto(`${WEB}/organisations/${state.organisationId}/consent-templates/new`, {
        waitUntil: 'domcontentloaded',
      });
      await page.fill('#name', unique('Pilot Consent'));
      await page.fill('#purpose', 'Consent for the internal pilot verification session.');
      await page.fill(
        '#plainLanguageSummary',
        'We record what is said so decisions can be traced back to their source. You choose what may be used, and you can change your mind.',
      );
      await page.fill('#supportedLanguages', 'en');
      // Every category the template can offer. The session configuration
      // refuses to save unless `participation` is among the required ones, so
      // a template that omits it cannot be used at all.
      const categories = page.getByRole('checkbox');
      for (let index = 0; index < (await categories.count()); index += 1) {
        await categories.nth(index).check();
      }
      await submit(/create|save/i);
      await page.waitForURL(/consent-templates\/[0-9a-f-]{36}/);
      await submit(/activate|publish/i);
      await page
        .getByText(/active/i)
        .first()
        .waitFor();

      await page.goto(
        `${WEB}/workspaces/${state.workspaceId}/sessions/${state.sessionId}/consent-configuration`,
        { waitUntil: 'domcontentloaded' },
      );
      await chooseFirst('template');
      for (const group of await radioGroups('category-')) {
        await page.locator(`input[name="${group.name}"]`).first().check();
      }
      await page.fill(
        '#participantIntroduction',
        'What you agree to, and how to change your mind.',
      );
      await expectOk(/consent-configuration/, () => submit(/configure consent|save changes/i));
    });

    await step('capture mixed consent decisions', async () => {
      await page.goto(participantsUrl, { waitUntil: 'domcontentloaded' });
      // The list arrives from the API after hydration; reading the DOM before
      // it lands finds an empty page and silently skips everyone.
      await page.locator('a[href*="/participants/"]:not([href$="/new"])').first().waitFor();
      state.participantIds = await page.$$eval('a[href*="/participants/"]', (anchors) => [
        ...new Set(
          anchors
            .map((anchor) => anchor.getAttribute('href').match(/participants\/([0-9a-f-]{36})/))
            .filter((match) => match !== null)
            .map((match) => match[1]),
        ),
      ]);

      // Mixed on purpose: the first participant grants everything, the second
      // declines the optional categories. A run where everyone says yes never
      // exercises the redaction the product exists for.
      for (const [index, participantId] of state.participantIds.entries()) {
        await page.goto(`${participantsUrl}/${participantId}/consent`, {
          waitUntil: 'domcontentloaded',
        });
        // `captureMethod` is a free-text record of how the facilitator took
        // the decision, and already carries a sensible default.
        for (const group of await radioGroups('decision-')) {
          // Grant (the first option) or decline (the second). Everyone grants
          // what the session requires; only the first participant also grants
          // the optional categories, so the report later has something to
          // redact.
          const decline = group.optional && index > 0;
          await page
            .locator(`input[name="${group.name}"]`)
            .nth(decline ? 1 : 0)
            .check();
        }
        await expectOk(/consent/, () => submit(/record|capture|save/i));
        if (index === 0) state.consentingParticipantId = participantId;
      }
      if (state.consentingParticipantId === undefined) {
        throw new Error('no participant consented — the evidence steps would be meaningless');
      }
    });

    await step('open the session', async () => {
      await page.goto(`${WEB}/workspaces/${state.workspaceId}/sessions/${state.sessionId}`, {
        waitUntil: 'domcontentloaded',
      });
      await expectOk(/\/transition/, () => submit(/^open$/i));
    });

    const evidenceUrl = `${WEB}/workspaces/${state.workspaceId}/sessions/${state.sessionId}/evidence`;
    const outcomesUrl = `${WEB}/workspaces/${state.workspaceId}/sessions/${state.sessionId}/outcomes`;
    const reportsUrl = `${WEB}/workspaces/${state.workspaceId}/sessions/${state.sessionId}/reports`;

    const captureEvidence = async (title, attribution) => {
      await page.goto(evidenceUrl, { waitUntil: 'domcontentloaded' });
      await page.selectOption('#evidenceType', 'observation');
      await page.selectOption('#attributionMode', attribution);
      // Attribution decides whether a source participant is required: an
      // anonymous contribution still names which participant it came from,
      // and the identity is withheld downstream rather than never recorded.
      if ((await page.locator('#sourceParticipantId').count()) > 0) {
        // Deliberately the participant who granted every category. Picking
        // whoever happens to be first would make the run's outcome depend on
        // list order rather than on consent.
        await page.selectOption('#sourceParticipantId', state.consentingParticipantId);
      }
      await page.fill('#title', title);
      await page.fill(
        '#content',
        'Captured through the deployed web application during internal-pilot verification.',
      );
      const response = await expectOk(/\/evidence$/, () => submit(/capture and submit/i));
      return (await response.json()).id;
    };

    await step('capture and submit evidence', async () => {
      state.evidenceId = await captureEvidence(unique('Pilot Evidence'), 'anonymous');
    });

    await step('capture a second piece of evidence to reject', async () => {
      state.rejectableId = await captureEvidence(unique('Pilot Evidence B'), 'anonymous');
    });

    await step('propose a decision', async () => {
      await page.goto(outcomesUrl, { waitUntil: 'domcontentloaded' });
      await submit(/decisions/i);
      await page.fill('#outcomeTitle', unique('Pilot Decision'));
      await page.fill('#outcomeBody', 'The pilot proceeds on the deployed environment.');
      const response = await expectOk(/\/decisions$/, () => submit(/^save$/i));
      state.decisionId = (await response.json()).id;
    });

    await step('create a report', async () => {
      await page.goto(reportsUrl, { waitUntil: 'domcontentloaded' });
      await page.fill('#reportTitle', unique('Pilot Report'));
      await page.selectOption('#reportAudience', 'internal');
      const response = await expectOk(/\/reports$/, () => submit(/create report/i));
      state.reportId = (await response.json()).id;
    });

    // ── Review ─────────────────────────────────────────────────────────────
    const openEvidence = async (id) => {
      await page.goto(`${evidenceUrl}/${id}`, { waitUntil: 'domcontentloaded' });
      await page
        .getByRole('button', { name: /assign|begin review|validate/i })
        .first()
        .waitFor();
    };

    const assignReviewer = async () => {
      // The picker's first option is a "Choose a reviewer…" placeholder, so
      // index 1 is the first real member.
      await page.locator('select[aria-label="Assign reviewer"]').selectOption({ index: 1 });
      await expectOk(/\/review\/assignment/, () => submit(/^assign$/i));
    };

    await step('assign a reviewer', async () => {
      await openEvidence(state.evidenceId);
      await assignReviewer();
    });

    await step('request and respond to a clarification', async () => {
      await expectOk(/\/review/, () => submit(/begin review/i));

      // "Ask a question" opens the form; "Send" submits it.
      await submit(/ask a question/i);
      await page.fill('#clarificationQuestion', 'Which meeting did this observation come from?');
      await expectOk(/clarifications/, () => submit(/^send$/i));

      await submit(/^respond$/i);
      await page
        .locator('textarea[id^="response-"]')
        .first()
        .fill('The internal-pilot verification session, recorded in this workspace.');
      await expectOk(/respond/, () => submit(/send response/i));
    });

    await step('validate the evidence', async () => {
      // Answering a clarification leaves the evidence in `needs_clarification`;
      // the reviewer closes the question before deciding, so a decision is
      // never taken with an open question hanging over it.
      await expectOk(/clarifications/, () => submit(/close and resume review/i));
      await expectOk(/\/review/, () => submit(/^validate$/i));
    });

    await step('reject the second piece of evidence', async () => {
      await openEvidence(state.rejectableId);
      await assignReviewer();
      await expectOk(/\/review/, () => submit(/begin review/i));
      // "Reject" opens the reason field; rejection is never one click.
      await submit(/^reject$/i);
      await page.fill('#rejectReason', 'Duplicate of the first observation; kept for the record.');
      await expectOk(/\/review/, () => submit(/confirm rejection/i));
    });

    // ── Outcomes ───────────────────────────────────────────────────────────
    await step('confirm the decision on validated evidence', async () => {
      await page.goto(`${outcomesUrl}/decisions/${state.decisionId}`, {
        waitUntil: 'domcontentloaded',
      });
      await chooseFirst('supportEvidenceId');
      await expectOk(/support/, () => submit(/record basis/i));
      await outcomeAction(/^confirm$/i);
    });

    const createOutcome = async (tab, title, body, extra) => {
      await page.goto(outcomesUrl, { waitUntil: 'domcontentloaded' });
      await submit(new RegExp(tab, 'i'));
      await page.fill('#outcomeTitle', title);
      await page.fill('#outcomeBody', body);
      if (extra !== undefined) await extra();
      const response = await expectOk(/\/(commitments|actions)$/, () => submit(/^save$/i));
      return (await response.json()).id;
    };

    await step('propose a commitment', async () => {
      state.commitmentId = await createOutcome(
        'commitments',
        unique('Pilot Commitment'),
        'The pilot team will report back on what the deployment revealed.',
        async () => page.fill('#ownerDescription', 'Pilot team'),
      );
    });

    await step('activate the commitment', async () => {
      await page.goto(`${outcomesUrl}/commitments/${state.commitmentId}`, {
        waitUntil: 'domcontentloaded',
      });
      await chooseFirst('supportEvidenceId');
      await expectOk(/support/, () => submit(/record basis/i));
      await outcomeAction(/^activate$/i);
    });

    await step('create an action', async () => {
      state.actionId = await createOutcome(
        'actions',
        unique('Pilot Action'),
        'Write up the deployment findings for the pilot release note.',
        async () => page.fill('#ownerDescription', 'Pilot team'),
      );
    });

    await step('update the action progress', async () => {
      await page.goto(`${outcomesUrl}/actions/${state.actionId}`, {
        waitUntil: 'domcontentloaded',
      });
      // Progress only exists once the work has started; a percentage on a
      // not-yet-started action would be a number about nothing.
      // Progress only exists once the work has started; every outcome action
      // is a two-step "choose, then confirm" so a lifecycle change is never a
      // single stray click.
      await outcomeAction(/^start$/i);

      // Reload rather than carrying on in place: the page refetches after a
      // transition and clears whichever panel is open, so opening the next one
      // immediately races that refetch.
      await page.goto(`${outcomesUrl}/actions/${state.actionId}`, {
        waitUntil: 'domcontentloaded',
      });
      await outcomeAction(/^record progress$/i, async () => {
        await page.fill('#percentComplete', '50');
        await page.fill('#reason', 'Half of the write-up is drafted.');
      });
    });

    await step('complete the action', async () => {
      await page.goto(`${outcomesUrl}/actions/${state.actionId}`, {
        waitUntil: 'domcontentloaded',
      });
      await outcomeAction(/^mark complete$/i, async () =>
        page.fill('#reason', 'The write-up is finished.'),
      );
    });

    await step('close the session', async () => {
      await page.goto(`${WEB}/workspaces/${state.workspaceId}/sessions/${state.sessionId}`, {
        waitUntil: 'domcontentloaded',
      });
      await expectOk(/\/transition/, () => submit(/^close$/i));
    });

    // ── Reporting ──────────────────────────────────────────────────────────
    await step('cite the validated evidence in the report', async () => {
      await page.goto(`${reportsUrl}/${state.reportId}`, { waitUntil: 'domcontentloaded' });
      await chooseFirst('citeSource');
      await expectOk(/\/sources/, () => submit(/^cite$/i));
      await page
        .getByText(/cited at version/i)
        .first()
        .waitFor();
    });

    await step('send the report for review', async () => {
      await page.goto(`${reportsUrl}/${state.reportId}`, { waitUntil: 'domcontentloaded' });
      await page.fill('#synthesis', 'The deployed application carries the whole workflow.');
      await expectOk(/\/reports\//, () => submit(/^save$/i));
      await expectOk(/\/transitions/, () => submit(/submit for review/i));
    });

    await step('approve the report', async () => {
      await expectOk(/\/transitions/, () => submit(/^approve$/i));
    });

    await step('publish the report internally', async () => {
      await expectOk(/\/transitions/, () => submit(/publish/i));
    });

    if (process.env.WITNESS_PILOT_RECON === '1') {
      await page.waitForTimeout(2000);
      await describe();
    }

    for (const format of ['HTML', 'MARKDOWN', 'JSON', 'CSV']) {
      await step(`export the report as ${format.toLowerCase()}`, async () => {
        await page.goto(`${reportsUrl}/${state.reportId}`, { waitUntil: 'domcontentloaded' });
        const [download] = await Promise.all([
          page.waitForEvent('download'),
          submit(new RegExp(`^${format}$`)),
        ]);
        if (download.suggestedFilename() === '') {
          throw new Error('the export produced no filename');
        }
        const path = await download.path();
        const { size } = await stat(path);
        if (size === 0) throw new Error(`the ${format} export was empty`);
      });
    }
  } catch {
    // The step line and the inventory have already been printed.
  }

  if (apiFailures.length > 0) {
    process.stdout.write(`\nRefused API calls:\n  ${apiFailures.join('\n  ')}\n`);
  }
  if (consoleErrors.length > 0) {
    process.stdout.write(`\nBrowser console errors:\n  ${consoleErrors.join('\n  ')}\n`);
  }

  process.stdout.write(`\n${passed}/${stepNumber} steps passed\n`);
  await browser.close();
  process.exit(passed === stepNumber ? 0 : 1);
};

await main();
