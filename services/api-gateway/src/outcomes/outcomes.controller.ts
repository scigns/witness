/**
 * HTTP adapter for decisions, commitments and actions (BUILD_ROADMAP.md
 * Milestone 7).
 *
 * Three registers under `:workspaceId/sessions/:sessionId`, mirroring
 * `EvidenceController` — `AuthorizationGuard.resolveScope` Casbin-scopes
 * every outcome action the same way, no guard change needed.
 *
 * The `@Requires` split is the milestone's institutional split, not a
 * technical one. Creating and editing an outcome, and running an action
 * through start/progress/block/complete, are `outcome:create`/`update`/
 * `transition` — contributor-tier work. Confirming a decision or activating
 * a commitment is `outcome:confirm`, and superseding, reversing or
 * withdrawing one is `outcome:close`, both reviewer-tier, because those are
 * the moments an outcome becomes — or stops being — institutional record.
 * The commitment and decision transition routes therefore choose their
 * required action from the request body, the same way
 * `EvidenceReviewController` does for review actions.
 */

import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { ZodType } from 'zod';

import {
  actionItemTransitionRequestSchema,
  commitmentTransitionRequestSchema,
  createActionItemRequestSchema,
  decisionTransitionRequestSchema,
  proposeCommitmentRequestSchema,
  proposeDecisionRequestSchema,
  recordOutcomeSupportRequestSchema,
  updateActionItemRequestSchema,
  updateCommitmentRequestSchema,
  updateDecisionRequestSchema,
  type ActionItemDetail,
  type ActionItemSummary,
  type CommitmentDetail,
  type CommitmentSummary,
  type DecisionDetail,
  type DecisionSummary,
  type OutcomeSupportView,
} from '@witness/contracts';
import { DomainError } from '@witness/domain';

import {
  AuthorizationGuard,
  Requires,
  type RequestWithPrincipal,
} from '../authz/authorization.guard.js';
import type { Action } from '../authz/authorization.port.js';
import { PolicyEnforcementService } from '../authz/policy-enforcement.service.js';
import { OutcomesService } from './outcomes.service.js';
import { OutcomeSupportService } from './outcome-support.service.js';

function parseOr<T>(schema: ZodType<T>, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new BadRequestException({
      error: {
        code: 'VALIDATION_FAILED',
        message: 'The request body is not valid.',
        fields: parsed.error.flatten().fieldErrors,
      },
    });
  }
  return parsed.data;
}

async function translateDomainErrors<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof DomainError) {
      throw new BadRequestException({ error: { code: error.code, message: error.message } });
    }
    throw error;
  }
}

@Controller('api/v1/workspaces/:workspaceId/sessions/:sessionId')
@UseGuards(AuthorizationGuard)
export class OutcomesController {
  constructor(
    private readonly outcomes: OutcomesService,
    private readonly support: OutcomeSupportService,
    private readonly policyEnforcement: PolicyEnforcementService,
  ) {}

  // ─── Decisions ────────────────────────────────────────────────────────────

  @Get('decisions')
  @Requires('outcome:read')
  async listDecisions(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
  ): Promise<{ decisions: DecisionSummary[] }> {
    return { decisions: await this.outcomes.listDecisions(workspaceId, sessionId) };
  }

  @Get('decisions/:decisionId')
  @Requires('outcome:read')
  async getDecision(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Param('decisionId', ParseUUIDPipe) decisionId: string,
  ): Promise<DecisionDetail> {
    return this.outcomes.getDecision(workspaceId, sessionId, decisionId);
  }

  @Get('decisions/:decisionId/history')
  @Requires('outcome:read')
  async decisionHistory(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Param('decisionId', ParseUUIDPipe) decisionId: string,
  ) {
    return { events: await this.outcomes.decisionHistory(workspaceId, sessionId, decisionId) };
  }

  @Post('decisions')
  @Requires('outcome:create')
  async proposeDecision(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Body() body: unknown,
    @Req() request: RequestWithPrincipal,
  ): Promise<DecisionDetail> {
    const parsed = parseOr(proposeDecisionRequestSchema, body);
    return translateDomainErrors(() =>
      this.outcomes.proposeDecision(workspaceId, sessionId, parsed, request.principal!),
    );
  }

  @Patch('decisions/:decisionId')
  @Requires('outcome:update')
  async updateDecision(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Param('decisionId', ParseUUIDPipe) decisionId: string,
    @Body() body: unknown,
    @Req() request: RequestWithPrincipal,
  ): Promise<DecisionDetail> {
    const parsed = parseOr(updateDecisionRequestSchema, body);
    return translateDomainErrors(() =>
      this.outcomes.updateDecision(workspaceId, sessionId, decisionId, parsed, request.principal!),
    );
  }

  /**
   * `@Requires('outcome:read')` is the floor, not the real check: the
   * body-derived action below is enforced before anything is written, so a
   * contributor cannot confirm a decision by reaching this route.
   */
  @Post('decisions/:decisionId/transitions')
  @Requires('outcome:read')
  async transitionDecision(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Param('decisionId', ParseUUIDPipe) decisionId: string,
    @Body() body: unknown,
    @Req() request: RequestWithPrincipal,
  ): Promise<DecisionDetail> {
    const parsed = parseOr(decisionTransitionRequestSchema, body);
    await this.requireAction(
      request,
      workspaceId,
      parsed.action === 'confirm' ? 'outcome:confirm' : 'outcome:close',
    );
    return translateDomainErrors(() =>
      this.outcomes.transitionDecision(
        workspaceId,
        sessionId,
        decisionId,
        parsed,
        request.principal!,
      ),
    );
  }

  // ─── Commitments ──────────────────────────────────────────────────────────

  @Get('commitments')
  @Requires('outcome:read')
  async listCommitments(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
  ): Promise<{ commitments: CommitmentSummary[] }> {
    return { commitments: await this.outcomes.listCommitments(workspaceId, sessionId) };
  }

  @Get('commitments/:commitmentId')
  @Requires('outcome:read')
  async getCommitment(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Param('commitmentId', ParseUUIDPipe) commitmentId: string,
  ): Promise<CommitmentDetail> {
    return this.outcomes.getCommitment(workspaceId, sessionId, commitmentId);
  }

  @Get('commitments/:commitmentId/history')
  @Requires('outcome:read')
  async commitmentHistory(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Param('commitmentId', ParseUUIDPipe) commitmentId: string,
  ) {
    return { events: await this.outcomes.commitmentHistory(workspaceId, sessionId, commitmentId) };
  }

  @Post('commitments')
  @Requires('outcome:create')
  async proposeCommitment(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Body() body: unknown,
    @Req() request: RequestWithPrincipal,
  ): Promise<CommitmentDetail> {
    const parsed = parseOr(proposeCommitmentRequestSchema, body);
    return translateDomainErrors(() =>
      this.outcomes.proposeCommitment(workspaceId, sessionId, parsed, request.principal!),
    );
  }

  @Patch('commitments/:commitmentId')
  @Requires('outcome:update')
  async updateCommitment(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Param('commitmentId', ParseUUIDPipe) commitmentId: string,
    @Body() body: unknown,
    @Req() request: RequestWithPrincipal,
  ): Promise<CommitmentDetail> {
    const parsed = parseOr(updateCommitmentRequestSchema, body);
    return translateDomainErrors(() =>
      this.outcomes.updateCommitment(
        workspaceId,
        sessionId,
        commitmentId,
        parsed,
        request.principal!,
      ),
    );
  }

  /**
   * `fulfil` is contributor-tier: recording that an undertaking was met is
   * the ordinary work of following one up, not a claim to institutional
   * authority. Activating, withdrawing and superseding are not.
   */
  @Post('commitments/:commitmentId/transitions')
  @Requires('outcome:read')
  async transitionCommitment(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Param('commitmentId', ParseUUIDPipe) commitmentId: string,
    @Body() body: unknown,
    @Req() request: RequestWithPrincipal,
  ): Promise<CommitmentDetail> {
    const parsed = parseOr(commitmentTransitionRequestSchema, body);
    const required: Action =
      parsed.action === 'activate'
        ? 'outcome:confirm'
        : parsed.action === 'fulfil'
          ? 'outcome:transition'
          : 'outcome:close';
    await this.requireAction(request, workspaceId, required);
    return translateDomainErrors(() =>
      this.outcomes.transitionCommitment(
        workspaceId,
        sessionId,
        commitmentId,
        parsed,
        request.principal!,
      ),
    );
  }

  // ─── Actions ──────────────────────────────────────────────────────────────

  @Get('actions')
  @Requires('outcome:read')
  async listActionItems(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
  ): Promise<{ actions: ActionItemSummary[] }> {
    return { actions: await this.outcomes.listActionItems(workspaceId, sessionId) };
  }

  @Get('actions/:actionItemId')
  @Requires('outcome:read')
  async getActionItem(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Param('actionItemId', ParseUUIDPipe) actionItemId: string,
  ): Promise<ActionItemDetail> {
    return this.outcomes.getActionItem(workspaceId, sessionId, actionItemId);
  }

  @Get('actions/:actionItemId/history')
  @Requires('outcome:read')
  async actionItemHistory(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Param('actionItemId', ParseUUIDPipe) actionItemId: string,
  ) {
    return { events: await this.outcomes.actionItemHistory(workspaceId, sessionId, actionItemId) };
  }

  @Post('actions')
  @Requires('outcome:create')
  async createActionItem(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Body() body: unknown,
    @Req() request: RequestWithPrincipal,
  ): Promise<ActionItemDetail> {
    const parsed = parseOr(createActionItemRequestSchema, body);
    return translateDomainErrors(() =>
      this.outcomes.createActionItem(workspaceId, sessionId, parsed, request.principal!),
    );
  }

  @Patch('actions/:actionItemId')
  @Requires('outcome:update')
  async updateActionItem(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Param('actionItemId', ParseUUIDPipe) actionItemId: string,
    @Body() body: unknown,
    @Req() request: RequestWithPrincipal,
  ): Promise<ActionItemDetail> {
    const parsed = parseOr(updateActionItemRequestSchema, body);
    return translateDomainErrors(() =>
      this.outcomes.updateActionItem(
        workspaceId,
        sessionId,
        actionItemId,
        parsed,
        request.principal!,
      ),
    );
  }

  /**
   * Every action transition is `outcome:transition`: an action is how an
   * institution carries out a decision, not an institutional claim of its
   * own, so none of its states are reviewer-gated.
   */
  @Post('actions/:actionItemId/transitions')
  @Requires('outcome:transition')
  async transitionActionItem(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Param('actionItemId', ParseUUIDPipe) actionItemId: string,
    @Body() body: unknown,
    @Req() request: RequestWithPrincipal,
  ): Promise<ActionItemDetail> {
    const parsed = parseOr(actionItemTransitionRequestSchema, body);
    return translateDomainErrors(() =>
      this.outcomes.transitionActionItem(
        workspaceId,
        sessionId,
        actionItemId,
        parsed,
        request.principal!,
      ),
    );
  }

  // ─── Support ──────────────────────────────────────────────────────────────

  @Get(':outcomeType/:outcomeId/support')
  @Requires('outcome:read')
  async listSupport(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Param('outcomeType') outcomeType: string,
    @Param('outcomeId', ParseUUIDPipe) outcomeId: string,
  ): Promise<{ support: OutcomeSupportView[] }> {
    const resolved = toOutcomeType(outcomeType);
    await this.outcomes.resolveOutcomeForSupport(workspaceId, sessionId, resolved, outcomeId);
    return { support: await this.support.listViews(resolved, outcomeId) };
  }

  @Post(':outcomeType/:outcomeId/support')
  @Requires('outcome:link_support')
  async recordSupport(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Param('outcomeType') outcomeType: string,
    @Param('outcomeId', ParseUUIDPipe) outcomeId: string,
    @Body() body: unknown,
    @Req() request: RequestWithPrincipal,
  ): Promise<OutcomeSupportView> {
    const resolved = toOutcomeType(outcomeType);
    const parsed = parseOr(recordOutcomeSupportRequestSchema, body);
    const { scope } = await this.outcomes.resolveOutcomeForSupport(
      workspaceId,
      sessionId,
      resolved,
      outcomeId,
    );
    return translateDomainErrors(() =>
      this.support.record(scope, resolved, outcomeId, parsed, request.principal!),
    );
  }

  @Delete(':outcomeType/:outcomeId/support/:supportId')
  @HttpCode(204)
  @Requires('outcome:link_support')
  async removeSupport(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Param('outcomeType') outcomeType: string,
    @Param('outcomeId', ParseUUIDPipe) outcomeId: string,
    @Param('supportId', ParseUUIDPipe) supportId: string,
    @Req() request: RequestWithPrincipal,
  ): Promise<void> {
    const resolved = toOutcomeType(outcomeType);
    // Scoping only. Whether the outcome is authoritative is re-read inside
    // the removal's own transaction — see `OutcomeSupportService.remove`.
    const { scope } = await this.outcomes.resolveOutcomeForSupport(
      workspaceId,
      sessionId,
      resolved,
      outcomeId,
    );
    await this.support.remove(scope, resolved, outcomeId, supportId, request.principal!);
  }

  /**
   * The body-derived half of this controller's authorisation. `@Requires`
   * runs before the body is parsed, so a route whose required action depends
   * on the requested transition has to re-ask here; the guard's own scope
   * resolution is reproduced by passing the workspace explicitly.
   */
  private async requireAction(
    request: RequestWithPrincipal,
    workspaceId: string,
    action: Action,
  ): Promise<void> {
    const decision = await this.policyEnforcement.decide(request.principal!, action, {
      type: 'workspace',
      workspaceId,
    });

    if (!decision.allowed) {
      throw new ForbiddenException({
        error: { code: 'FORBIDDEN', message: decision.reason },
      });
    }
  }
}

const OUTCOME_PATH_SEGMENTS: Readonly<Record<string, 'decision' | 'commitment' | 'action_item'>> =
  Object.freeze({
    decisions: 'decision',
    commitments: 'commitment',
    actions: 'action_item',
  });

/**
 * The support routes are shared across the three registers, so the register
 * name arrives as a path segment. Anything else is a 404 rather than a 400:
 * `/api/v1/.../sessions/:id/nonsense/:id/support` is not a malformed request,
 * it is a route that does not exist.
 */
function toOutcomeType(segment: string): 'decision' | 'commitment' | 'action_item' {
  const resolved = OUTCOME_PATH_SEGMENTS[segment];
  if (resolved === undefined) {
    throw new NotFoundException({
      error: { code: 'NOT_FOUND', message: `Unknown outcome register '${segment}'.` },
    });
  }
  return resolved;
}
