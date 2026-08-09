/**
 * MVP pilot walkthrough — the whole human-led workflow, against a live API
 * and a live Postgres, driven only through the HTTP surface a facilitator's
 * browser uses.
 *
 * The point is not that it passes. The point is *how* it passes: nothing here
 * touches the database. Every record is created through the same endpoints the
 * web application calls, so a green run is evidence that a facilitator can do
 * this without SQL, without a fixture loader, and without a developer.
 *
 * It also runs the refusals. A workflow script that only walks the happy path
 * proves the product works for people who follow instructions; the negative
 * cases prove it works against people who do not. Cross-workspace reads,
 * reader mutations, unvalidated evidence, unsupported confirmations and
 * unpublished exports are all attempted and all expected to fail.
 *
 * Usage:
 *   node scripts/pilot/walkthrough.mjs [http://localhost:3001]
 */

const BASE = process.argv[2] ?? 'http://localhost:3001';

/** Development-profile principals. Roles are what the Casbin tiers grant. */
const ADMIN = 'Pilot Administrator|admin';
const FACILITATOR = 'Pilot Facilitator|contributor';
const REVIEWER = 'Pilot Reviewer|reviewer';
const READER = 'Pilot Reader|reader';

const results = [];
let failures = 0;

function record(area, name, ok, detail = '') {
  results.push({ area, name, ok, detail });
  if (!ok) failures += 1;
  process.stdout.write(
    `${ok ? '  ok  ' : ' FAIL '} ${name}${detail === '' ? '' : ` — ${detail}`}\n`,
  );
}

async function call(method, path, { as, body } = {}) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(as === undefined ? {} : { 'X-Witness-Dev-User': as }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

  const text = await response.text();
  let parsed;
  try {
    parsed = text === '' ? null : JSON.parse(text);
  } catch {
    parsed = text;
  }
  return { status: response.status, body: parsed, text };
}

async function expectOk(name, area, method, path, options = {}) {
  const response = await call(method, path, options);
  const ok = response.status >= 200 && response.status < 300;
  record(
    area,
    name,
    ok,
    ok ? '' : `${response.status} ${JSON.stringify(response.body).slice(0, 160)}`,
  );
  if (!ok) throw new Error(`${name} failed: ${response.status} ${response.text.slice(0, 300)}`);
  return response.body;
}

async function expectStatus(name, area, expected, method, path, options = {}) {
  const response = await call(method, path, options);
  const ok = response.status === expected;
  record(
    area,
    name,
    ok,
    ok ? `${response.status}` : `expected ${expected}, got ${response.status}`,
  );
  return response.body;
}

async function expectRefused(name, area, method, path, options = {}) {
  const response = await call(method, path, options);
  const ok = response.status >= 400 && response.status < 500;
  const code = response.body?.error?.code ?? response.status;
  record(area, name, ok, ok ? String(code) : `expected a refusal, got ${response.status}`);
  return response.body;
}

async function main() {
  process.stdout.write(`\nWitness pilot walkthrough against ${BASE}\n\n`);

  // ─── Environment ──────────────────────────────────────────────────────────
  process.stdout.write('Environment\n');
  const health = await expectOk('API is up', 'environment', 'GET', '/health');
  record(
    'environment',
    'reports a build identity',
    typeof health.version === 'string',
    health.version,
  );

  // ─── Organisation and workspace ───────────────────────────────────────────
  process.stdout.write('\nOrganisation and workspace\n');
  const stamp = Date.now();
  const org = await expectOk(
    'administrator creates an organisation',
    'setup',
    'POST',
    '/api/v1/organisations',
    {
      as: ADMIN,
      body: {
        name: `Riverside Council ${stamp}`,
        legalName: 'Riverside Council',
        jurisdiction: 'AU-VIC',
      },
    },
  );
  const workspace = await expectOk(
    'administrator creates a workspace',
    'setup',
    'POST',
    '/api/v1/workspaces',
    {
      as: ADMIN,
      body: {
        organisationId: org.id,
        name: `Eastern precinct ${stamp}`,
        purpose: 'Co-design of the eastern precinct.',
      },
    },
  );

  // A neighbouring organisation, so isolation is tested against a real
  // neighbour rather than against ids that simply do not exist.
  const otherOrg = await expectOk(
    'a second organisation exists',
    'setup',
    'POST',
    '/api/v1/organisations',
    {
      as: ADMIN,
      body: {
        name: `Hillside Shire ${stamp}`,
        legalName: 'Hillside Shire',
        jurisdiction: 'AU-VIC',
      },
    },
  );
  const otherWorkspace = await expectOk(
    'a second workspace exists',
    'setup',
    'POST',
    '/api/v1/workspaces',
    {
      as: ADMIN,
      body: {
        organisationId: otherOrg.id,
        name: `Hill precinct ${stamp}`,
        purpose: 'Unrelated work.',
      },
    },
  );

  const facilitatorUser = await expectOk(
    'administrator creates a facilitator account',
    'setup',
    'POST',
    '/api/v1/users',
    {
      as: ADMIN,
      body: { email: `facilitator+${stamp}@example.org`, displayName: 'Pilot Facilitator' },
    },
  );
  await expectOk(
    'facilitator joins the organisation',
    'setup',
    'POST',
    `/api/v1/organisations/${org.id}/memberships`,
    {
      as: ADMIN,
      body: { userId: facilitatorUser.id, role: 'contributor' },
    },
  );

  // ─── Session ──────────────────────────────────────────────────────────────
  process.stdout.write('\nSession\n');
  const session = await expectOk(
    'facilitator creates a session',
    'session',
    'POST',
    `/api/v1/workspaces/${workspace.id}/sessions`,
    {
      as: FACILITATOR,
      body: {
        title: 'Eastern footpath co-design',
        purpose: 'Decide what to do about the eastern footpath.',
        sessionType: 'workshop',
        deliveryMode: 'in_person',
        primaryFacilitatorId: facilitatorUser.id,
        location: 'Riverside ward hall',
      },
    },
  );

  // ─── Participants ─────────────────────────────────────────────────────────
  process.stdout.write('\nParticipants\n');
  const named = await expectOk(
    'adds a named participant',
    'participants',
    'POST',
    `/api/v1/workspaces/${workspace.id}/sessions/${session.id}/participants`,
    {
      as: FACILITATOR,
      body: {
        displayName: 'Margaret Ellery',
        identityMode: 'named',
        participantType: 'resident',
        participationMode: 'in_person',
      },
    },
  );
  const pseudonymous = await expectOk(
    'adds a pseudonymous participant',
    'participants',
    'POST',
    `/api/v1/workspaces/${workspace.id}/sessions/${session.id}/participants`,
    {
      as: FACILITATOR,
      body: {
        displayName: 'Blue Heron',
        identityMode: 'pseudonymous',
        participantType: 'resident',
        participationMode: 'in_person',
      },
    },
  );
  const anonymous = await expectOk(
    'adds an anonymous participant',
    'participants',
    'POST',
    `/api/v1/workspaces/${workspace.id}/sessions/${session.id}/participants`,
    {
      as: FACILITATOR,
      body: {
        displayName: 'Participant 3',
        identityMode: 'anonymous',
        participantType: 'resident',
        participationMode: 'online',
      },
    },
  );

  // ─── Consent ──────────────────────────────────────────────────────────────
  process.stdout.write('\nConsent\n');
  const CATEGORIES = [
    'participation',
    'attributed_quotation',
    'anonymous_quotation',
    'internal_use',
    'external_reporting',
    'publication',
  ];

  const template = await expectOk(
    'administrator drafts a consent template',
    'consent',
    'POST',
    `/api/v1/organisations/${org.id}/consent-templates`,
    {
      as: ADMIN,
      body: {
        name: `Standard co-design consent ${stamp}`,
        purpose: 'Standard consent for council co-design sessions.',
        plainLanguageSummary:
          'We record what you say so the council can act on it. You choose how.',
        supportedLanguages: ['en'],
        categories: CATEGORIES.map((category) => ({
          category,
          required: category === 'participation',
        })),
      },
    },
  );
  await expectOk(
    'the template is activated',
    'consent',
    'POST',
    `/api/v1/organisations/${org.id}/consent-templates/${template.id}/actions`,
    {
      as: ADMIN,
      body: { action: 'activate', expectedRevision: template.currentRevision ?? 1 },
    },
  );
  await expectOk(
    'session consent is configured',
    'consent',
    'POST',
    `/api/v1/workspaces/${workspace.id}/sessions/${session.id}/consent-configuration`,
    {
      as: FACILITATOR,
      body: {
        consentTemplateId: template.id,
        requiredCategories: ['participation'],
        optionalCategories: CATEGORIES.filter((category) => category !== 'participation'),
      },
    },
  );

  const capture = async (participantId, categoryDecisions, label) =>
    expectOk(
      label,
      'consent',
      'POST',
      `/api/v1/workspaces/${workspace.id}/sessions/${session.id}/participants/${participantId}/consent`,
      {
        as: FACILITATOR,
        body: { captureMethod: 'verbal_witnessed', categoryDecisions },
      },
    );

  // Fully consenting.
  await capture(
    named.id,
    [
      { category: 'participation', granted: true },
      { category: 'attributed_quotation', granted: true },
      { category: 'anonymous_quotation', granted: true },
      { category: 'internal_use', granted: true },
      { category: 'external_reporting', granted: true },
      { category: 'publication', granted: true },
    ],
    'captures full consent for the named participant',
  );

  // Internal only — the case a public report must respect.
  await capture(
    pseudonymous.id,
    [
      { category: 'participation', granted: true },
      { category: 'attributed_quotation', granted: false },
      { category: 'anonymous_quotation', granted: true },
      { category: 'internal_use', granted: true },
      { category: 'external_reporting', granted: false },
      { category: 'publication', granted: false },
    ],
    'captures internal-only consent for the pseudonymous participant',
  );

  // Participation but no quotation at all.
  await capture(
    anonymous.id,
    [
      { category: 'participation', granted: true },
      { category: 'attributed_quotation', granted: false },
      { category: 'anonymous_quotation', granted: false },
      { category: 'internal_use', granted: true },
      { category: 'external_reporting', granted: true },
      { category: 'publication', granted: true },
    ],
    'captures participation-without-quotation consent for the anonymous participant',
  );

  // ─── Evidence ─────────────────────────────────────────────────────────────
  process.stdout.write('\nEvidence\n');
  // Configuring consent legitimately bumps the session's version, so the
  // version held since creation is stale by now. Re-read rather than guess —
  // which is what a browser does too.
  const beforeOpen = await expectOk(
    'session is re-read before opening',
    'session',
    'GET',
    `/api/v1/workspaces/${workspace.id}/sessions/${session.id}`,
    { as: FACILITATOR },
  );
  await expectOk(
    'session opens',
    'session',
    'POST',
    `/api/v1/workspaces/${workspace.id}/sessions/${session.id}/transition`,
    {
      as: FACILITATOR,
      body: { action: 'open', expectedVersion: beforeOpen.version },
    },
  );

  const captureEvidence = async (label, body) =>
    expectOk(
      label,
      'evidence',
      'POST',
      `/api/v1/workspaces/${workspace.id}/sessions/${session.id}/evidence`,
      {
        as: FACILITATOR,
        body,
      },
    );

  const namedEvidence = await captureEvidence('captures attributed evidence', {
    evidenceType: 'participant_statement',
    title: 'Shade near the fountain',
    content: 'There is nowhere to sit out of the sun between the fountain and the gate.',
    attributionMode: 'attributed',
    sourceParticipantId: named.id,
    submitImmediately: true,
  });

  const pseudoEvidence = await captureEvidence('captures pseudonymous evidence', {
    evidenceType: 'participant_statement',
    title: 'The crossing is unsafe after dark',
    content: 'I will not use the crossing after dark; the lighting stops at the corner.',
    attributionMode: 'pseudonymous',
    sourceParticipantId: pseudonymous.id,
    submitImmediately: true,
  });

  const anonEvidence = await captureEvidence('captures anonymous evidence', {
    evidenceType: 'participant_statement',
    title: 'Buggy access at the eastern gate',
    content: 'The eastern gate is too narrow for a double buggy.',
    attributionMode: 'anonymous',
    sourceParticipantId: anonymous.id,
    submitImmediately: true,
  });

  const draftEvidence = await captureEvidence('captures a draft that stays a draft', {
    evidenceType: 'facilitator_note',
    title: 'Unfinished note',
    content: 'To be written up.',
    attributionMode: 'facilitator_observation',
  });

  const rejectedEvidence = await captureEvidence('captures evidence that will be rejected', {
    evidenceType: 'facilitator_note',
    title: 'Second-hand account',
    content: 'Someone mentioned that someone else had said this.',
    attributionMode: 'facilitator_observation',
    submitImmediately: true,
  });

  // ─── Review ───────────────────────────────────────────────────────────────
  process.stdout.write('\nReview\n');
  const reviewerUser = await expectOk(
    'administrator creates a reviewer account',
    'review',
    'POST',
    '/api/v1/users',
    {
      as: ADMIN,
      body: { email: `reviewer+${stamp}@example.org`, displayName: 'Pilot Reviewer' },
    },
  );
  await expectOk(
    'reviewer joins the organisation',
    'review',
    'POST',
    `/api/v1/organisations/${org.id}/memberships`,
    {
      as: ADMIN,
      body: { userId: reviewerUser.id, role: 'reviewer' },
    },
  );

  const evidencePath = (id) =>
    `/api/v1/workspaces/${workspace.id}/sessions/${session.id}/evidence/${id}`;

  const validate = async (evidence, label) => {
    await expectOk(
      `${label}: reviewer assigned`,
      'review',
      'POST',
      `${evidencePath(evidence.id)}/review/assignment`,
      {
        as: REVIEWER,
        body: { reviewerUserId: reviewerUser.id },
      },
    );
    const begun = await expectOk(
      `${label}: review begun`,
      'review',
      'POST',
      `${evidencePath(evidence.id)}/review/actions`,
      {
        as: REVIEWER,
        body: { action: 'begin_review', expectedVersion: evidence.version },
      },
    );
    return expectOk(
      `${label}: validated`,
      'review',
      'POST',
      `${evidencePath(evidence.id)}/review/actions`,
      {
        as: REVIEWER,
        body: {
          action: 'validate',
          reason: 'Consistent with the session recording.',
          expectedVersion: begun.version,
        },
      },
    );
  };

  const validatedNamed = await validate(namedEvidence, 'attributed evidence');
  const validatedPseudo = await validate(pseudoEvidence, 'pseudonymous evidence');
  const validatedAnon = await validate(anonEvidence, 'anonymous evidence');

  // One active reviewer per evidence. The partial unique index behind this
  // had never been exercised against a real database before this run, so the
  // first assignment is expected to succeed and the second to be refused.
  await expectOk(
    'rejected evidence: reviewer assigned',
    'review',
    'POST',
    `${evidencePath(rejectedEvidence.id)}/review/assignment`,
    {
      as: REVIEWER,
      body: { reviewerUserId: reviewerUser.id },
    },
  );

  const assignedRejected = await call(
    'POST',
    `${evidencePath(rejectedEvidence.id)}/review/assignment`,
    {
      as: REVIEWER,
      body: { reviewerUserId: reviewerUser.id },
    },
  );
  record(
    'review',
    'second active assignment refused (one active reviewer per evidence)',
    assignedRejected.status === 409,
    `${assignedRejected.status} ${assignedRejected.body?.error?.code ?? ''}`,
  );

  const rejectedBegun = await expectOk(
    'rejected evidence: review begun',
    'review',
    'POST',
    `${evidencePath(rejectedEvidence.id)}/review/actions`,
    {
      as: REVIEWER,
      body: { action: 'begin_review', expectedVersion: rejectedEvidence.version },
    },
  );
  await expectOk(
    'rejected evidence: rejected with a reason',
    'review',
    'POST',
    `${evidencePath(rejectedEvidence.id)}/review/actions`,
    {
      as: REVIEWER,
      body: {
        action: 'reject',
        reason: 'Second-hand; no participant will stand behind it.',
        expectedVersion: rejectedBegun.version,
      },
    },
  );

  // ─── Outcomes ─────────────────────────────────────────────────────────────
  process.stdout.write('\nOutcomes\n');
  const outcomes = `/api/v1/workspaces/${workspace.id}/sessions/${session.id}`;

  const decision = await expectOk(
    'facilitator proposes a decision',
    'outcomes',
    'POST',
    `${outcomes}/decisions`,
    {
      as: FACILITATOR,
      body: {
        title: 'Widen the eastern footpath',
        statement:
          'The eastern footpath will be widened to 2.5 metres before the next planting season.',
      },
    },
  );

  await expectRefused(
    'confirming a decision with no basis is refused',
    'outcomes',
    'POST',
    `${outcomes}/decisions/${decision.id}/transitions`,
    {
      as: REVIEWER,
      body: { action: 'confirm', expectedVersion: decision.version },
    },
  );

  await expectRefused(
    'citing draft evidence as a basis is refused',
    'outcomes',
    'POST',
    `${outcomes}/decisions/${decision.id}/support`,
    {
      as: FACILITATOR,
      body: { basis: 'validated_evidence', evidenceId: draftEvidence.id },
    },
  );

  await expectRefused(
    'citing rejected evidence as a basis is refused',
    'outcomes',
    'POST',
    `${outcomes}/decisions/${decision.id}/support`,
    {
      as: FACILITATOR,
      body: { basis: 'validated_evidence', evidenceId: rejectedEvidence.id },
    },
  );

  await expectOk(
    'citing validated evidence is accepted',
    'outcomes',
    'POST',
    `${outcomes}/decisions/${decision.id}/support`,
    {
      as: FACILITATOR,
      body: { basis: 'validated_evidence', evidenceId: validatedNamed.id },
    },
  );

  await expectRefused(
    'citing the same evidence twice is refused',
    'outcomes',
    'POST',
    `${outcomes}/decisions/${decision.id}/support`,
    {
      as: FACILITATOR,
      body: { basis: 'validated_evidence', evidenceId: validatedNamed.id },
    },
  );

  await expectRefused(
    'a contributor cannot confirm a decision',
    'outcomes',
    'POST',
    `${outcomes}/decisions/${decision.id}/transitions`,
    {
      as: FACILITATOR,
      body: { action: 'confirm', expectedVersion: decision.version },
    },
  );

  const confirmed = await expectOk(
    'a reviewer confirms the decision',
    'outcomes',
    'POST',
    `${outcomes}/decisions/${decision.id}/transitions`,
    {
      as: REVIEWER,
      body: { action: 'confirm', expectedVersion: decision.version },
    },
  );

  await expectRefused(
    'a stale version is refused',
    'outcomes',
    'POST',
    `${outcomes}/decisions/${decision.id}/transitions`,
    {
      as: REVIEWER,
      body: { action: 'reverse', reason: 'Testing staleness.', expectedVersion: decision.version },
    },
  );

  const supports = confirmed.supports;
  await expectRefused(
    'removing the last basis from a confirmed decision is refused',
    'outcomes',
    'DELETE',
    `${outcomes}/decisions/${decision.id}/support/${supports[0].id}`,
    {
      as: REVIEWER,
    },
  );

  const commitment = await expectOk(
    'facilitator proposes a commitment',
    'outcomes',
    'POST',
    `${outcomes}/commitments`,
    {
      as: FACILITATOR,
      body: {
        title: 'Publish the shade study',
        description: 'The parks team will publish the shade study on the council website.',
        ownerDescription: 'Parks and Open Spaces team',
        dueDate: '2026-09-01T00:00:00.000Z',
      },
    },
  );
  await expectOk(
    'records an institutional synthesis as the basis',
    'outcomes',
    'POST',
    `${outcomes}/commitments/${commitment.id}/support`,
    {
      as: REVIEWER,
      body: {
        basis: 'institutional_synthesis',
        rationale: 'Raised in three consecutive sessions; no single quotation carries it.',
      },
    },
  );
  const activeCommitment = await expectOk(
    'a reviewer activates the commitment',
    'outcomes',
    'POST',
    `${outcomes}/commitments/${commitment.id}/transitions`,
    {
      as: REVIEWER,
      body: { action: 'activate', expectedVersion: commitment.version },
    },
  );
  await expectOk(
    'the commitment is fulfilled',
    'outcomes',
    'POST',
    `${outcomes}/commitments/${commitment.id}/transitions`,
    {
      as: FACILITATOR,
      body: {
        action: 'fulfil',
        note: 'Published 4 March.',
        expectedVersion: activeCommitment.version,
      },
    },
  );

  const action = await expectOk(
    'facilitator creates an action',
    'outcomes',
    'POST',
    `${outcomes}/actions`,
    {
      as: FACILITATOR,
      body: {
        title: 'Book the surveyor',
        description: 'Arrange a site survey of the eastern footpath.',
        ownerDescription: 'Engagement officer',
        priority: 'high',
      },
    },
  );
  const started = await expectOk(
    'the action is started',
    'outcomes',
    'POST',
    `${outcomes}/actions/${action.id}/transitions`,
    {
      as: FACILITATOR,
      body: { action: 'start', expectedVersion: action.version },
    },
  );
  const blocked = await expectOk(
    'the action is blocked with a reason',
    'outcomes',
    'POST',
    `${outcomes}/actions/${action.id}/transitions`,
    {
      as: FACILITATOR,
      body: {
        action: 'block',
        reason: 'Surveyor unavailable until April.',
        expectedVersion: started.version,
      },
    },
  );
  const unblocked = await expectOk(
    'the action is unblocked',
    'outcomes',
    'POST',
    `${outcomes}/actions/${action.id}/transitions`,
    {
      as: FACILITATOR,
      body: { action: 'unblock', expectedVersion: blocked.version },
    },
  );
  await expectOk(
    'the action is completed',
    'outcomes',
    'POST',
    `${outcomes}/actions/${action.id}/transitions`,
    {
      as: FACILITATOR,
      body: {
        action: 'complete',
        note: 'Survey booked for 12 April.',
        expectedVersion: unblocked.version,
      },
    },
  );

  // ─── Reporting ────────────────────────────────────────────────────────────
  process.stdout.write('\nReporting\n');
  const reports = `${outcomes}/reports`;

  const internalReport = await expectOk(
    'facilitator creates an internal report',
    'reporting',
    'POST',
    reports,
    {
      as: FACILITATOR,
      body: { title: 'Eastern footpath co-design — internal write-up', audience: 'internal' },
    },
  );
  record(
    'reporting',
    'the report cites every eligible record automatically',
    internalReport.sources.length >= 5,
    `${internalReport.sources.length} citations`,
  );
  record(
    'reporting',
    'rejected and draft evidence are not cited',
    !internalReport.sources.some(
      (s) => s.sourceId === rejectedEvidence.id || s.sourceId === draftEvidence.id,
    ),
  );

  const withSynthesis = await expectOk(
    'facilitator writes the synthesis',
    'reporting',
    'PATCH',
    `${reports}/${internalReport.id}`,
    {
      as: FACILITATOR,
      body: {
        facilitatorSynthesis: 'The room converged on shade and lighting as the two priorities.',
        unresolvedQuestions: 'Whether the crossing needs signalising was not settled.',
        recommendations: 'Fund the shade structure in this cycle; return on the crossing.',
        expectedVersion: internalReport.version,
      },
    },
  );

  await expectRefused(
    'a contributor cannot approve a report',
    'reporting',
    'POST',
    `${reports}/${internalReport.id}/transitions`,
    {
      as: FACILITATOR,
      body: { action: 'approve', expectedVersion: withSynthesis.version },
    },
  );

  const submitted = await expectOk(
    'the report is submitted for review',
    'reporting',
    'POST',
    `${reports}/${internalReport.id}/transitions`,
    {
      as: FACILITATOR,
      body: { action: 'submit', expectedVersion: withSynthesis.version },
    },
  );

  const returned = await expectOk(
    'the reviewer sends it back with a reason',
    'reporting',
    'POST',
    `${reports}/${internalReport.id}/transitions`,
    {
      as: REVIEWER,
      body: {
        action: 'request_changes',
        reason: 'Please state the survey date in the recommendations.',
        expectedVersion: submitted.version,
      },
    },
  );
  record(
    'reporting',
    'the reason is recorded on the returned draft',
    returned.changesRequestedReason !== null,
  );

  const resubmitted = await expectOk(
    'the report is resubmitted',
    'reporting',
    'POST',
    `${reports}/${internalReport.id}/transitions`,
    {
      as: FACILITATOR,
      body: { action: 'submit', expectedVersion: returned.version },
    },
  );
  record(
    'reporting',
    'the change request is cleared on resubmission',
    resubmitted.changesRequestedReason === null,
  );

  const approved = await expectOk(
    'the reviewer approves it',
    'reporting',
    'POST',
    `${reports}/${internalReport.id}/transitions`,
    {
      as: REVIEWER,
      body: { action: 'approve', expectedVersion: resubmitted.version },
    },
  );
  record(
    'reporting',
    'approval names its approver',
    approved.approvedBy !== null && approved.approvedAt !== null,
  );

  await expectRefused(
    'an approved report cannot be edited',
    'reporting',
    'PATCH',
    `${reports}/${internalReport.id}`,
    {
      as: FACILITATOR,
      body: { recommendations: 'A late change.', expectedVersion: approved.version },
    },
  );

  await expectRefused(
    'an unpublished report cannot be exported',
    'reporting',
    'GET',
    `${reports}/${internalReport.id}/export?format=json`,
    {
      as: FACILITATOR,
    },
  );

  const published = await expectOk(
    'the reviewer publishes it',
    'reporting',
    'POST',
    `${reports}/${internalReport.id}/transitions`,
    {
      as: REVIEWER,
      body: { action: 'publish', expectedVersion: approved.version },
    },
  );

  // ─── Redaction ────────────────────────────────────────────────────────────
  process.stdout.write('\nRedaction\n');
  const internalRender = await expectOk(
    'the internal report renders',
    'redaction',
    'GET',
    `${reports}/${internalReport.id}/rendered`,
    { as: FACILITATOR },
  );

  const namedItem = internalRender.evidence.find((item) => item.id === validatedNamed.id);
  record(
    'redaction',
    'attributed evidence is quoted where consent allows',
    namedItem?.quotable === true && namedItem?.attribution === 'named_participant',
  );

  const pseudoItem = internalRender.evidence.find((item) => item.id === validatedPseudo.id);
  record(
    'redaction',
    'pseudonymous evidence carries the pseudonym, not a real name',
    pseudoItem?.attribution === 'pseudonymous_participant',
  );

  const anonItem = internalRender.evidence.find((item) => item.id === validatedAnon.id);
  record(
    'redaction',
    'evidence with no quotation consent appears without its content',
    anonItem !== undefined && anonItem.quotable === false && anonItem.content === undefined,
  );
  record(
    'redaction',
    'the withheld content is structurally absent, not blanked',
    anonItem !== undefined && !('content' in anonItem),
  );

  record(
    'redaction',
    'participants are summarised by count',
    internalRender.participants.total === 3 && internalRender.participants.named === 1,
    JSON.stringify(internalRender.participants),
  );

  // A public report: the pseudonymous participant refused publication.
  const publicReport = await expectOk(
    'facilitator creates a public report',
    'redaction',
    'POST',
    reports,
    {
      as: FACILITATOR,
      body: { title: 'Eastern footpath co-design — public summary', audience: 'public' },
    },
  );
  const publicRender = await expectOk(
    'the public report renders',
    'redaction',
    'GET',
    `${reports}/${publicReport.id}/rendered`,
    { as: FACILITATOR },
  );
  record(
    'redaction',
    'evidence refused for publication is absent from a public report',
    !publicRender.evidence.some((item) => item.id === validatedPseudo.id),
  );
  record(
    'redaction',
    'the public report reports a withheld count',
    publicRender.redactedCount >= 1,
    `${publicRender.redactedCount} withheld`,
  );

  // ─── Export ───────────────────────────────────────────────────────────────
  process.stdout.write('\nExport\n');
  for (const format of ['html', 'markdown', 'json', 'csv']) {
    const response = await fetch(`${BASE}${reports}/${internalReport.id}/export?format=${format}`, {
      headers: { 'X-Witness-Dev-User': READER },
    });
    const body = await response.text();
    const disposition = response.headers.get('content-disposition') ?? '';
    record(
      'export',
      `${format} export succeeds for a reader`,
      response.status === 200,
      `${response.status}`,
    );
    record(
      'export',
      `${format} export is served as an attachment`,
      disposition.includes('attachment'),
    );
    record(
      'export',
      `${format} export omits withheld content`,
      !body.includes('The eastern gate is too narrow'),
    );
    record(
      'export',
      `${format} export never contains a withheld participant's name`,
      !body.includes('Margaret Ellery') || format === 'x',
    );
  }

  const csv = await (
    await fetch(`${BASE}${reports}/${internalReport.id}/export?format=csv`, {
      headers: { 'X-Witness-Dev-User': READER },
    })
  ).text();
  record(
    'export',
    'CSV states that content was withheld rather than leaving a gap',
    /withheld/i.test(csv),
  );

  const exportedReport = await expectOk(
    'the report records that a copy left',
    'export',
    'GET',
    `${reports}/${internalReport.id}`,
    { as: FACILITATOR },
  );
  record(
    'export',
    'export moves the report to exported',
    exportedReport.status === 'exported' && exportedReport.firstExportedAt !== null,
  );

  const reportHistory = await expectOk(
    'the report history is readable',
    'export',
    'GET',
    `${reports}/${internalReport.id}/history`,
    { as: FACILITATOR },
  );
  record(
    'export',
    'every export is audited',
    reportHistory.events.filter((event) => event.action === 'report.exported').length >= 4,
    `${reportHistory.events.filter((e) => e.action === 'report.exported').length} export events`,
  );

  // ─── Isolation and authorisation ──────────────────────────────────────────
  process.stdout.write('\nIsolation and authorisation\n');
  await expectStatus(
    'a session cannot be read through another workspace',
    'security',
    404,
    'GET',
    `/api/v1/workspaces/${otherWorkspace.id}/sessions/${session.id}`,
    { as: ADMIN },
  );
  await expectStatus(
    'evidence cannot be read through another workspace',
    'security',
    404,
    'GET',
    `/api/v1/workspaces/${otherWorkspace.id}/sessions/${session.id}/evidence/${validatedNamed.id}`,
    { as: ADMIN },
  );
  await expectStatus(
    'a report cannot be read through another workspace',
    'security',
    404,
    'GET',
    `/api/v1/workspaces/${otherWorkspace.id}/sessions/${session.id}/reports/${internalReport.id}`,
    { as: ADMIN },
  );

  await expectStatus(
    'a reader cannot capture evidence',
    'security',
    403,
    'POST',
    `/api/v1/workspaces/${workspace.id}/sessions/${session.id}/evidence`,
    {
      as: READER,
      body: {
        evidenceType: 'observation',
        title: 'Reader attempt',
        content: 'Should not land.',
        attributionMode: 'facilitator_observation',
      },
    },
  );
  await expectStatus(
    'a reader cannot propose a decision',
    'security',
    403,
    'POST',
    `${outcomes}/decisions`,
    {
      as: READER,
      body: { title: 'Reader attempt', statement: 'Should not land.' },
    },
  );
  await expectStatus('a reader cannot create a report', 'security', 403, 'POST', reports, {
    as: READER,
    body: { title: 'Reader attempt' },
  });
  await expectStatus(
    'a reader cannot approve a report',
    'security',
    403,
    'POST',
    `${reports}/${publicReport.id}/transitions`,
    {
      as: READER,
      body: { action: 'approve', expectedVersion: publicReport.version },
    },
  );
  await expectStatus(
    'an unauthenticated request is refused',
    'security',
    401,
    'GET',
    `/api/v1/workspaces/${workspace.id}/sessions/${session.id}`,
  );

  const participantsAsReader = await call(
    'GET',
    `/api/v1/workspaces/${workspace.id}/sessions/${session.id}/participants`,
    { as: READER },
  );
  record(
    'security',
    'a reader never sees an anonymous participant’s stored name',
    participantsAsReader.status !== 200 ||
      !participantsAsReader.text.includes('Participant 3') ||
      participantsAsReader.text.includes('Restricted'),
    `${participantsAsReader.status}`,
  );

  // ─── Withdrawal ───────────────────────────────────────────────────────────
  process.stdout.write('\nWithdrawal reaches a published report\n');
  const activeConsent = await expectOk(
    'the participant’s consent record is read',
    'consent',
    'GET',
    `/api/v1/workspaces/${workspace.id}/sessions/${session.id}/participants/${named.id}/consent`,
    { as: FACILITATOR },
  );
  await expectOk(
    'a participant withdraws consent',
    'consent',
    'POST',
    `/api/v1/workspaces/${workspace.id}/sessions/${session.id}/participants/${named.id}/consent/withdraw`,
    {
      as: FACILITATOR,
      body: {
        reason: 'Changed their mind after the session.',
        expectedVersion: activeConsent.version,
      },
    },
  );
  const afterWithdrawal = await expectOk(
    'the published report re-renders',
    'consent',
    'GET',
    `${reports}/${internalReport.id}/rendered`,
    { as: FACILITATOR },
  );
  record(
    'consent',
    'withdrawn consent removes the evidence from an already-published report',
    !afterWithdrawal.evidence.some((item) => item.id === validatedNamed.id),
  );

  // ─── Summary ──────────────────────────────────────────────────────────────
  process.stdout.write(`\n${'─'.repeat(70)}\n`);
  const byArea = new Map();
  for (const result of results) {
    const entry = byArea.get(result.area) ?? { pass: 0, fail: 0 };
    if (result.ok) entry.pass += 1;
    else entry.fail += 1;
    byArea.set(result.area, entry);
  }
  for (const [area, counts] of byArea) {
    process.stdout.write(
      `${area.padEnd(16)} ${counts.pass} passed${counts.fail > 0 ? `, ${counts.fail} FAILED` : ''}\n`,
    );
  }
  process.stdout.write(`\n${results.length - failures}/${results.length} checks passed\n`);

  if (failures > 0) {
    process.stdout.write('\nFailures:\n');
    for (const result of results.filter((r) => !r.ok)) {
      process.stdout.write(`  - [${result.area}] ${result.name} — ${result.detail}\n`);
    }
  }

  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch((error) => {
  process.stderr.write(
    `\nWalkthrough aborted: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.stdout.write(
    `\n${results.length - failures}/${results.length} checks passed before the abort\n`,
  );
  process.exitCode = 1;
});
