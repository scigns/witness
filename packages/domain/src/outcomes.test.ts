import { describe, expect, it } from 'vitest';

import {
  toActionItemId,
  toActorId,
  toCoDesignSessionId,
  toCommitmentId,
  toDecisionId,
  toEvidenceId,
  toOrganisationId,
  toOutcomeSupportId,
  toWorkspaceId,
} from './ids.js';
import type { Actor } from './actor.js';
import {
  assertEvidenceSupportable,
  recordEvidenceSupport,
  recordSynthesisSupport,
  type OutcomeSupport,
  type SupportingEvidenceRef,
} from './outcome-support.js';
import {
  canCloseDecision,
  confirmDecision,
  proposeDecision,
  reverseDecision,
  supersedeDecision,
  updateDecision,
  type Decision,
} from './decision.js';
import {
  activateCommitment,
  fulfilCommitment,
  isOverdueCommitment,
  proposeCommitment,
  supersedeCommitment,
  updateCommitment,
  withdrawCommitment,
  type Commitment,
} from './commitment.js';
import {
  blockActionItem,
  cancelActionItem,
  completeActionItem,
  createActionItem,
  isOverdueActionItem,
  recordActionProgress,
  startActionItem,
  unblockActionItem,
  type ActionItem,
} from './action-item.js';

const HUMAN: Actor = {
  id: toActorId('11111111-1111-4111-8111-111111111111'),
  kind: 'human',
  displayName: 'Facilitator',
};
const NOW = new Date('2026-04-01T10:00:00Z');
const LATER = new Date('2026-04-01T11:00:00Z');

const ORG = toOrganisationId('22222222-2222-4222-8222-222222222222');
const ORG_2 = toOrganisationId('29999999-9999-4999-8999-999999999999');
const WORKSPACE = toWorkspaceId('33333333-3333-4333-8333-333333333333');
const WORKSPACE_2 = toWorkspaceId('39999999-9999-4999-8999-999999999999');
const SESSION = toCoDesignSessionId('44444444-4444-4444-8444-444444444444');
const EVIDENCE = toEvidenceId('55555555-5555-4555-8555-555555555555');
const SUPPORT_ID = toOutcomeSupportId('66666666-6666-4666-8666-666666666666');
const DECISION_ID = toDecisionId('77777777-7777-4777-8777-777777777777');
const DECISION_ID_2 = toDecisionId('79999999-9999-4999-8999-999999999999');
const COMMITMENT_ID = toCommitmentId('88888888-8888-4888-8888-888888888888');
const COMMITMENT_ID_2 = toCommitmentId('89999999-9999-4999-8999-999999999999');
const ACTION_ID = toActionItemId('99999999-9999-4999-8999-999999999999');

const SCOPE = { organisationId: ORG, workspaceId: WORKSPACE };

function validatedEvidence(overrides: Partial<SupportingEvidenceRef> = {}): SupportingEvidenceRef {
  return {
    id: EVIDENCE,
    organisationId: ORG,
    workspaceId: WORKSPACE,
    sessionId: SESSION,
    reviewStatus: 'validated',
    verificationStatus: 'verified',
    version: 4,
    ...overrides,
  };
}

function evidenceSupport(): OutcomeSupport {
  return recordEvidenceSupport({
    id: SUPPORT_ID,
    sessionId: SESSION,
    outcomeType: 'decision',
    outcomeId: DECISION_ID,
    scope: SCOPE,
    evidence: validatedEvidence(),
    recordedBy: HUMAN,
    at: NOW,
  }).support;
}

function synthesisSupport(): OutcomeSupport {
  return recordSynthesisSupport({
    id: SUPPORT_ID,
    sessionId: SESSION,
    outcomeType: 'decision',
    outcomeId: DECISION_ID,
    scope: SCOPE,
    rationale: 'Synthesised across three sessions; no single quote captures it.',
    recordedBy: HUMAN,
    at: NOW,
  }).support;
}

// ─── Evidence linkage ────────────────────────────────────────────────────────

describe('assertEvidenceSupportable', () => {
  it('accepts validated, verified, in-scope evidence', () => {
    expect(() => assertEvidenceSupportable(validatedEvidence(), SCOPE)).not.toThrow();
  });

  it('ATTACK — rejects every non-validated review status', () => {
    for (const reviewStatus of [
      'draft',
      'submitted',
      'under_review',
      'needs_clarification',
      'rejected',
      'withdrawn',
    ] as const) {
      expect(() => assertEvidenceSupportable(validatedEvidence({ reviewStatus }), SCOPE)).toThrow(
        /only validated evidence/i,
      );
    }
  });

  it('ATTACK — rejects evidence that is validated but not verified', () => {
    expect(() =>
      assertEvidenceSupportable(validatedEvidence({ verificationStatus: 'disputed' }), SCOPE),
    ).toThrow(/cannot support an institutional outcome/i);
  });

  it('ATTACK — rejects cross-workspace evidence', () => {
    expect(() =>
      assertEvidenceSupportable(validatedEvidence({ workspaceId: WORKSPACE_2 }), SCOPE),
    ).toThrow(/another workspace/i);
  });

  it('ATTACK — rejects cross-organisation evidence', () => {
    expect(() =>
      assertEvidenceSupportable(validatedEvidence({ organisationId: ORG_2 }), SCOPE),
    ).toThrow(/another organisation/i);
  });
});

describe('recordEvidenceSupport', () => {
  it('freezes the evidence version and verification status at link time', () => {
    const { support, event } = recordEvidenceSupport({
      id: SUPPORT_ID,
      sessionId: SESSION,
      outcomeType: 'decision',
      outcomeId: DECISION_ID,
      scope: SCOPE,
      evidence: validatedEvidence({ version: 7 }),
      recordedBy: HUMAN,
      at: NOW,
    });
    expect(support.basis).toBe('validated_evidence');
    expect(support.evidenceId).toBe(EVIDENCE);
    expect(support.evidenceVersion).toBe(7);
    expect(support.evidenceVerificationStatus).toBe('verified');
    expect(event.action).toBe('outcome_support.evidence_linked');
  });
});

describe('recordSynthesisSupport', () => {
  it('records institutional synthesis with its rationale', () => {
    const { support, event } = recordSynthesisSupport({
      id: SUPPORT_ID,
      sessionId: SESSION,
      outcomeType: 'decision',
      outcomeId: DECISION_ID,
      scope: SCOPE,
      rationale: 'No single piece of evidence; synthesised across the workshop.',
      recordedBy: HUMAN,
      at: NOW,
    });
    expect(support.basis).toBe('institutional_synthesis');
    expect(support.evidenceId).toBeNull();
    expect(support.rationale).toContain('synthesised');
    expect(event.action).toBe('outcome_support.synthesis_recorded');
  });

  it('ATTACK — refuses synthesis with no stated rationale', () => {
    expect(() =>
      recordSynthesisSupport({
        id: SUPPORT_ID,
        sessionId: SESSION,
        outcomeType: 'decision',
        outcomeId: DECISION_ID,
        scope: SCOPE,
        rationale: '   ',
        recordedBy: HUMAN,
        at: NOW,
      }),
    ).toThrow(/must state its rationale/i);
  });
});

// ─── Decisions ───────────────────────────────────────────────────────────────

function proposedDecision(): Decision {
  return proposeDecision('open', {
    id: DECISION_ID,
    organisationId: ORG,
    workspaceId: WORKSPACE,
    sessionId: SESSION,
    title: 'Prioritise shade near the fountain',
    statement: 'The group agreed shade in the plaza is the first priority for the next budget.',
    proposedBy: HUMAN,
    at: NOW,
  }).decision;
}

function confirmedDecision(): Decision {
  return confirmDecision(proposedDecision(), 'open', [evidenceSupport()], HUMAN, LATER).decision;
}

describe('Decision lifecycle', () => {
  it('proposes, confirms with support, then supersedes', () => {
    const proposed = proposedDecision();
    expect(proposed.status).toBe('proposed');

    const confirmed = confirmDecision(proposed, 'open', [evidenceSupport()], HUMAN, LATER);
    expect(confirmed.decision.status).toBe('confirmed');
    expect(confirmed.decision.confirmedBy).toEqual(HUMAN);
    expect(confirmed.event.action).toBe('decision.confirmed');

    const superseded = supersedeDecision(
      confirmed.decision,
      'open',
      DECISION_ID_2,
      HUMAN,
      'Replaced by a broader plaza decision.',
      LATER,
    );
    expect(superseded.decision.status).toBe('superseded');
    expect(superseded.decision.supersededByDecisionId).toBe(DECISION_ID_2);
  });

  it('confirms on institutional synthesis alone', () => {
    const { decision } = confirmDecision(
      proposedDecision(),
      'open',
      [synthesisSupport()],
      HUMAN,
      LATER,
    );
    expect(decision.status).toBe('confirmed');
  });

  it('ATTACK — refuses to confirm a decision with no support at all', () => {
    expect(() => confirmDecision(proposedDecision(), 'open', [], HUMAN, LATER)).toThrow(
      /validated evidence or a stated institutional synthesis/i,
    );
  });

  it('ATTACK — refuses to confirm an already-confirmed decision', () => {
    expect(() =>
      confirmDecision(confirmedDecision(), 'open', [evidenceSupport()], HUMAN, LATER),
    ).toThrow(/only a proposed decision can be confirmed/i);
  });

  it('ATTACK — refuses to edit a confirmed decision', () => {
    expect(() =>
      updateDecision(confirmedDecision(), 'open', HUMAN, { title: 'Rewritten' }, LATER),
    ).toThrow(/only a proposed decision can be edited/i);
  });

  it('ATTACK — refuses to supersede a decision with itself', () => {
    expect(() =>
      supersedeDecision(confirmedDecision(), 'open', DECISION_ID, HUMAN, null, LATER),
    ).toThrow(/cannot supersede itself/i);
  });

  it('ATTACK — a reversal requires a reason', () => {
    expect(() => reverseDecision(confirmedDecision(), 'open', HUMAN, '   ', LATER)).toThrow(
      /reversal reason/i,
    );
  });

  it('ATTACK — refuses to reverse a proposal that was never confirmed', () => {
    expect(() =>
      reverseDecision(proposedDecision(), 'open', HUMAN, 'Changed our minds.', LATER),
    ).toThrow(/only a confirmed decision can be reversed/i);
  });

  it('ATTACK — refuses any mutation on an archived session', () => {
    expect(() =>
      confirmDecision(proposedDecision(), 'archived', [evidenceSupport()], HUMAN, LATER),
    ).toThrow(/archived/i);
  });

  it('ATTACK — refuses to record outcomes before a session has opened', () => {
    for (const status of ['draft', 'scheduled'] as const) {
      expect(() =>
        proposeDecision(status, {
          id: DECISION_ID,
          organisationId: ORG,
          workspaceId: WORKSPACE,
          sessionId: SESSION,
          title: 'Too early',
          statement: 'Nothing has happened yet.',
          proposedBy: HUMAN,
          at: NOW,
        }),
      ).toThrow(/once a session has opened/i);
    }
  });

  it('permits outcomes to be recorded after a session closes', () => {
    const { decision } = proposeDecision('closed', {
      id: DECISION_ID,
      organisationId: ORG,
      workspaceId: WORKSPACE,
      sessionId: SESSION,
      title: 'Written up afterwards',
      statement: 'Recorded once the room had emptied.',
      proposedBy: HUMAN,
      at: NOW,
    });
    expect(decision.status).toBe('proposed');
  });

  it('canCloseDecision is true only for a confirmed decision', () => {
    expect(canCloseDecision(confirmedDecision(), 'open')).toBe(true);
    expect(canCloseDecision(proposedDecision(), 'open')).toBe(false);
    expect(canCloseDecision(confirmedDecision(), 'archived')).toBe(false);
  });
});

// ─── Commitments ─────────────────────────────────────────────────────────────

function proposedCommitment(): Commitment {
  return proposeCommitment('open', {
    id: COMMITMENT_ID,
    organisationId: ORG,
    workspaceId: WORKSPACE,
    sessionId: SESSION,
    title: 'Install shade sails',
    description: 'Council will install shade sails on the plaza before summer.',
    ownerDescription: "Council's parks team",
    dueDate: new Date('2026-11-01T00:00:00Z'),
    proposedBy: HUMAN,
    at: NOW,
  }).commitment;
}

function activeCommitment(): Commitment {
  return activateCommitment(proposedCommitment(), 'open', [evidenceSupport()], HUMAN, LATER)
    .commitment;
}

describe('Commitment lifecycle', () => {
  it('proposes with a plain-language owner and no user account', () => {
    const commitment = proposedCommitment();
    expect(commitment.status).toBe('proposed');
    expect(commitment.ownerDescription).toBe("Council's parks team");
    expect(commitment.ownerUserId).toBeNull();
  });

  it('activates with support, then fulfils', () => {
    const active = activeCommitment();
    expect(active.status).toBe('active');

    const { commitment, event } = fulfilCommitment(
      active,
      'open',
      HUMAN,
      'Installed 12 Oct.',
      LATER,
    );
    expect(commitment.status).toBe('fulfilled');
    expect(commitment.fulfilmentNote).toBe('Installed 12 Oct.');
    expect(event.action).toBe('commitment.fulfilled');
  });

  it('ATTACK — refuses to activate a commitment with no support', () => {
    expect(() => activateCommitment(proposedCommitment(), 'open', [], HUMAN, LATER)).toThrow(
      /validated evidence or a stated institutional synthesis/i,
    );
  });

  it('ATTACK — refuses to fulfil a commitment that was never activated', () => {
    expect(() => fulfilCommitment(proposedCommitment(), 'open', HUMAN, null, LATER)).toThrow(
      /only an active commitment can be fulfilled/i,
    );
  });

  it('ATTACK — a withdrawal requires a reason', () => {
    expect(() => withdrawCommitment(activeCommitment(), 'open', HUMAN, '  ', LATER)).toThrow(
      /withdrawal reason/i,
    );
  });

  it('ATTACK — refuses to withdraw an already-fulfilled commitment', () => {
    const fulfilled = fulfilCommitment(activeCommitment(), 'open', HUMAN, null, LATER).commitment;
    expect(() => withdrawCommitment(fulfilled, 'open', HUMAN, 'Too late.', LATER)).toThrow(
      /can no longer be withdrawn/i,
    );
  });

  it('ATTACK — refuses to supersede a commitment with itself', () => {
    expect(() =>
      supersedeCommitment(activeCommitment(), 'open', COMMITMENT_ID, HUMAN, null, LATER),
    ).toThrow(/cannot supersede itself/i);
  });

  it('allows an active commitment to be superseded by a later one', () => {
    const { commitment } = supersedeCommitment(
      activeCommitment(),
      'open',
      COMMITMENT_ID_2,
      HUMAN,
      'Scope widened.',
      LATER,
    );
    expect(commitment.status).toBe('superseded');
    expect(commitment.supersededByCommitmentId).toBe(COMMITMENT_ID_2);
  });

  it('allows an active commitment to be re-dated without losing its history', () => {
    const { commitment } = updateCommitment(
      activeCommitment(),
      'open',
      HUMAN,
      { dueDate: new Date('2026-12-01T00:00:00Z') },
      LATER,
    );
    expect(commitment.status).toBe('active');
    expect(commitment.activatedAt).not.toBeNull();
  });

  it('isOverdueCommitment is true only for an active, past-due commitment', () => {
    const active = activeCommitment();
    expect(isOverdueCommitment(active, new Date('2026-12-01T00:00:00Z'))).toBe(true);
    expect(isOverdueCommitment(active, new Date('2026-06-01T00:00:00Z'))).toBe(false);
    expect(isOverdueCommitment(proposedCommitment(), new Date('2026-12-01T00:00:00Z'))).toBe(false);
  });
});

// ─── Actions ─────────────────────────────────────────────────────────────────

function openAction(): ActionItem {
  return createActionItem('open', {
    id: ACTION_ID,
    organisationId: ORG,
    workspaceId: WORKSPACE,
    sessionId: SESSION,
    title: 'Get three quotes',
    description: 'Obtain three supplier quotes for shade sails.',
    ownerDescription: 'Procurement',
    priority: 'high',
    dueDate: new Date('2026-09-01T00:00:00Z'),
    createdBy: HUMAN,
    at: NOW,
  }).actionItem;
}

describe('ActionItem lifecycle', () => {
  it('runs open → in_progress → blocked → in_progress → completed', () => {
    const started = startActionItem(openAction(), 'open', HUMAN, LATER).actionItem;
    expect(started.status).toBe('in_progress');

    const blocked = blockActionItem(
      started,
      'open',
      HUMAN,
      'Awaiting budget sign-off.',
      LATER,
    ).actionItem;
    expect(blocked.status).toBe('blocked');
    expect(blocked.blockedReason).toBe('Awaiting budget sign-off.');

    const unblocked = unblockActionItem(blocked, 'open', HUMAN, LATER).actionItem;
    expect(unblocked.status).toBe('in_progress');
    expect(unblocked.blockedReason).toBeNull();

    const completed = completeActionItem(
      unblocked,
      'open',
      HUMAN,
      'All three received.',
      LATER,
    ).actionItem;
    expect(completed.status).toBe('completed');
    expect(completed.percentComplete).toBe(100);
  });

  it('records progress on an in-progress action', () => {
    const started = startActionItem(openAction(), 'open', HUMAN, LATER).actionItem;
    const { actionItem, event } = recordActionProgress(
      started,
      'open',
      HUMAN,
      { percentComplete: 60, note: 'Two quotes in.' },
      LATER,
    );
    expect(actionItem.percentComplete).toBe(60);
    expect(actionItem.progressNote).toBe('Two quotes in.');
    expect(event.action).toBe('action_item.progress_recorded');
  });

  it('records progress on a blocked action without unblocking it', () => {
    const blocked = blockActionItem(
      startActionItem(openAction(), 'open', HUMAN, LATER).actionItem,
      'open',
      HUMAN,
      'Awaiting sign-off.',
      LATER,
    ).actionItem;
    const { actionItem } = recordActionProgress(blocked, 'open', HUMAN, { note: 'Chased.' }, LATER);
    expect(actionItem.status).toBe('blocked');
    expect(actionItem.progressNote).toBe('Chased.');
  });

  it('completes directly from open without a start', () => {
    const { actionItem } = completeActionItem(openAction(), 'open', HUMAN, null, LATER);
    expect(actionItem.status).toBe('completed');
    expect(actionItem.percentComplete).toBe(100);
  });

  it('ATTACK — rejects an out-of-range progress percentage', () => {
    const started = startActionItem(openAction(), 'open', HUMAN, LATER).actionItem;
    for (const percentComplete of [-1, 101]) {
      expect(() =>
        recordActionProgress(started, 'open', HUMAN, { percentComplete }, LATER),
      ).toThrow(/between 0 and 100/i);
    }
  });

  it('ATTACK — rejects a no-op progress update', () => {
    const started = startActionItem(openAction(), 'open', HUMAN, LATER).actionItem;
    expect(() => recordActionProgress(started, 'open', HUMAN, {}, LATER)).toThrow(
      /percentage or a note/i,
    );
  });

  it('ATTACK — rejects blocking an action that was never started', () => {
    expect(() => blockActionItem(openAction(), 'open', HUMAN, 'Stuck.', LATER)).toThrow(
      /only an in-progress action can be blocked/i,
    );
  });

  it('ATTACK — a block requires a reason', () => {
    const started = startActionItem(openAction(), 'open', HUMAN, LATER).actionItem;
    expect(() => blockActionItem(started, 'open', HUMAN, '   ', LATER)).toThrow(/blocking reason/i);
  });

  it('ATTACK — a cancellation requires a reason', () => {
    expect(() => cancelActionItem(openAction(), 'open', HUMAN, '', LATER)).toThrow(
      /cancellation reason/i,
    );
  });

  it('ATTACK — refuses any transition out of a terminal state', () => {
    const completed = completeActionItem(openAction(), 'open', HUMAN, null, LATER).actionItem;
    const cancelled = cancelActionItem(
      openAction(),
      'open',
      HUMAN,
      'Not needed.',
      LATER,
    ).actionItem;

    expect(() => completeActionItem(completed, 'open', HUMAN, null, LATER)).toThrow(
      /can no longer be completed/i,
    );
    expect(() => cancelActionItem(cancelled, 'open', HUMAN, 'Again.', LATER)).toThrow(
      /can no longer be cancelled/i,
    );
    expect(() => startActionItem(completed, 'open', HUMAN, LATER)).toThrow(
      /only an open action can be started/i,
    );
  });

  it('isOverdueActionItem ignores closed actions', () => {
    const past = new Date('2026-12-01T00:00:00Z');
    expect(isOverdueActionItem(openAction(), past)).toBe(true);
    const completed = completeActionItem(openAction(), 'open', HUMAN, null, LATER).actionItem;
    expect(isOverdueActionItem(completed, past)).toBe(false);
  });
});
