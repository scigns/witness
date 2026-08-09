/**
 * HTTP adapter for session reporting and export (BUILD_ROADMAP.md Milestone 8).
 *
 * Nested under `:workspaceId/sessions/:sessionId`, so
 * `AuthorizationGuard.resolveScope` Casbin-scopes every report action the
 * same way as evidence and outcomes, with no guard change.
 *
 * The transition route derives its required action from the request body, as
 * `EvidenceReviewController` and `OutcomesController` do: `submit` is
 * contributor work under `report:submit`, while `approve`/`request_changes`
 * need `report:approve` and `publish` needs `report:publish`, both
 * reviewer-tier. `@Requires` runs before the body is parsed, so the route
 * re-asks the policy engine before anything is written.
 *
 * The export route returns bytes rather than JSON, and the redaction has
 * already happened in `ReportsService.render` — this layer only chooses a
 * serialisation. `Content-Disposition: attachment` is set deliberately: an
 * exported report is a document to keep, and rendering caller-influenced HTML
 * inline in the browser's origin would be an XSS surface for no benefit.
 */

import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import type { ZodType } from 'zod';

import {
  createReportRequestSchema,
  includeReportSourceRequestSchema,
  reportTransitionRequestSchema,
  updateReportRequestSchema,
  REPORT_EXPORT_FORMATS,
  type RenderedReport,
  type ReportDetail,
  type ReportExportFormat,
  type ReportSourceView,
  type ReportSummary,
} from '@witness/contracts';
import { DomainError } from '@witness/domain';

import {
  AuthorizationGuard,
  Requires,
  type RequestWithPrincipal,
} from '../authz/authorization.guard.js';
import type { Action } from '../authz/authorization.port.js';
import { PolicyEnforcementService } from '../authz/policy-enforcement.service.js';
import { ReportsService } from './reports.service.js';
import { renderExport } from './report-export.js';

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

@Controller('api/v1/workspaces/:workspaceId/sessions/:sessionId/reports')
@UseGuards(AuthorizationGuard)
export class ReportsController {
  constructor(
    private readonly reports: ReportsService,
    private readonly policyEnforcement: PolicyEnforcementService,
  ) {}

  @Get()
  @Requires('report:read')
  async list(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
  ): Promise<{ reports: ReportSummary[] }> {
    return { reports: await this.reports.list(workspaceId, sessionId) };
  }

  @Get(':reportId')
  @Requires('report:read')
  async get(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Param('reportId', ParseUUIDPipe) reportId: string,
  ): Promise<ReportDetail> {
    return this.reports.get(workspaceId, sessionId, reportId);
  }

  @Get(':reportId/history')
  @Requires('report:read')
  async history(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Param('reportId', ParseUUIDPipe) reportId: string,
  ) {
    return { events: await this.reports.history(workspaceId, sessionId, reportId) };
  }

  /** The composed, redacted report — what the screen shows and what exports serialise. */
  @Get(':reportId/rendered')
  @Requires('report:read')
  async rendered(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Param('reportId', ParseUUIDPipe) reportId: string,
  ): Promise<RenderedReport> {
    return this.reports.render(workspaceId, sessionId, reportId);
  }

  @Post()
  @Requires('report:create')
  async create(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Body() body: unknown,
    @Req() request: RequestWithPrincipal,
  ): Promise<ReportDetail> {
    const parsed = parseOr(createReportRequestSchema, body);
    return translateDomainErrors(() =>
      this.reports.create(workspaceId, sessionId, parsed, request.principal!),
    );
  }

  @Patch(':reportId')
  @Requires('report:update')
  async update(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Param('reportId', ParseUUIDPipe) reportId: string,
    @Body() body: unknown,
    @Req() request: RequestWithPrincipal,
  ): Promise<ReportDetail> {
    const parsed = parseOr(updateReportRequestSchema, body);
    return translateDomainErrors(() =>
      this.reports.update(workspaceId, sessionId, reportId, parsed, request.principal!),
    );
  }

  /**
   * `@Requires('report:read')` is the floor; the body-derived action below is
   * the real check, so a contributor cannot approve or publish by reaching
   * this route.
   */
  @Post(':reportId/transitions')
  @Requires('report:read')
  async transition(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Param('reportId', ParseUUIDPipe) reportId: string,
    @Body() body: unknown,
    @Req() request: RequestWithPrincipal,
  ): Promise<ReportDetail> {
    const parsed = parseOr(reportTransitionRequestSchema, body);

    const required: Action =
      parsed.action === 'submit'
        ? 'report:submit'
        : parsed.action === 'publish'
          ? 'report:publish'
          : parsed.action === 'revise'
            ? 'report:update'
            : 'report:approve';
    await this.requireAction(request, workspaceId, required);

    return translateDomainErrors(() =>
      this.reports.transition(workspaceId, sessionId, reportId, parsed, request.principal!),
    );
  }

  @Get(':reportId/sources')
  @Requires('report:read')
  async listSources(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Param('reportId', ParseUUIDPipe) reportId: string,
  ): Promise<{ sources: ReportSourceView[] }> {
    const detail = await this.reports.get(workspaceId, sessionId, reportId);
    return { sources: detail.sources };
  }

  @Post(':reportId/sources')
  @Requires('report:update')
  async includeSource(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Param('reportId', ParseUUIDPipe) reportId: string,
    @Body() body: unknown,
    @Req() request: RequestWithPrincipal,
  ): Promise<ReportSourceView> {
    const parsed = parseOr(includeReportSourceRequestSchema, body);
    return translateDomainErrors(() =>
      this.reports.includeSource(workspaceId, sessionId, reportId, parsed, request.principal!),
    );
  }

  @Delete(':reportId/sources/:sourceId')
  @HttpCode(204)
  @Requires('report:update')
  async excludeSource(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Param('reportId', ParseUUIDPipe) reportId: string,
    @Param('sourceId', ParseUUIDPipe) sourceId: string,
    @Req() request: RequestWithPrincipal,
  ): Promise<void> {
    await this.reports.excludeSource(
      workspaceId,
      sessionId,
      reportId,
      sourceId,
      request.principal!,
    );
  }

  /**
   * Produce a copy. The redaction happens in the service; this route chooses
   * a serialisation and records that a copy left the system.
   */
  @Get(':reportId/export')
  @Requires('report:export')
  @Header('Cache-Control', 'no-store')
  async export(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Param('reportId', ParseUUIDPipe) reportId: string,
    @Query('format') format: string | undefined,
    @Req() request: RequestWithPrincipal,
    @Res() response: Response,
  ): Promise<void> {
    if (format === undefined || !(REPORT_EXPORT_FORMATS as readonly string[]).includes(format)) {
      throw new BadRequestException({
        error: {
          code: 'UNSUPPORTED_EXPORT_FORMAT',
          message: `Supported formats are ${REPORT_EXPORT_FORMATS.join(', ')}.`,
        },
      });
    }

    const rendered = await translateDomainErrors(() =>
      this.reports.export(
        workspaceId,
        sessionId,
        reportId,
        format as ReportExportFormat,
        request.principal!,
      ),
    );

    const result = renderExport(rendered, format as ReportExportFormat);

    // Always an attachment. An exported report is a document to keep, and
    // serving caller-influenced HTML inline in this origin would be an XSS
    // surface bought for nothing.
    response
      .status(200)
      .setHeader('Content-Type', result.contentType)
      .setHeader('Content-Disposition', `attachment; filename="${result.filename}"`)
      .send(result.body);
  }

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
      throw new ForbiddenException({ error: { code: 'FORBIDDEN', message: decision.reason } });
    }
  }
}
