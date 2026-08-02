/**
 * HTTP adapter for institutional records.
 *
 * Thin by design (ADR-0003): parse, authorise, delegate, serialise. No rule is
 * expressed here that is not also expressed in the domain, because a rule that
 * lives only in a controller is a rule that a second controller will not have.
 */

import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';

import {
  createRecordRequestSchema,
  reviewActionSchema,
  type RecordDetail,
  type RecordSummary,
} from '@witness/contracts';
import { DomainError } from '@witness/domain';

import {
  AuthorizationGuard,
  Requires,
  type RequestWithPrincipal,
} from '../authz/authorization.guard.js';
import { RecordsService } from './records.service.js';

@Controller('api/v1/records')
@UseGuards(AuthorizationGuard)
export class RecordsController {
  constructor(private readonly records: RecordsService) {}

  @Get()
  @Requires('record:read')
  async list(): Promise<{ records: RecordSummary[] }> {
    return { records: await this.records.list() };
  }

  @Get(':id')
  @Requires('record:read')
  async get(@Param('id') id: string): Promise<RecordDetail> {
    return this.records.get(id);
  }

  @Post()
  @Requires('record:create')
  async create(@Body() body: unknown, @Req() request: RequestWithPrincipal): Promise<RecordDetail> {
    const parsed = createRecordRequestSchema.safeParse(body);

    if (!parsed.success) {
      throw new BadRequestException({
        error: {
          code: 'VALIDATION_FAILED',
          message: 'The request body is not valid.',
          fields: parsed.error.flatten().fieldErrors,
        },
      });
    }

    return this.translateDomainErrors(() => this.records.create(parsed.data, request.principal!));
  }

  @Post(':id/review')
  @HttpCode(200)
  @Requires('record:review')
  async review(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: RequestWithPrincipal,
  ): Promise<RecordDetail> {
    const parsed = reviewActionSchema.safeParse(body);

    if (!parsed.success) {
      throw new BadRequestException({
        error: {
          code: 'VALIDATION_FAILED',
          message: 'The review action is not valid.',
          fields: parsed.error.flatten().fieldErrors,
        },
      });
    }

    return this.translateDomainErrors(() =>
      this.records.review(id, parsed.data, request.principal!),
    );
  }

  /**
   * Translate domain errors into HTTP.
   *
   * The domain knows nothing about status codes (ADR-0003), so the mapping lives
   * here. A domain error is a 400: the caller asked for something the rules
   * forbid, and the message explains which rule — an opaque 500 would hide a
   * governance guarantee behind an apparent server fault.
   */
  private async translateDomainErrors<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof DomainError) {
        throw new BadRequestException({
          error: { code: error.code, message: error.message },
        });
      }
      throw error;
    }
  }
}
