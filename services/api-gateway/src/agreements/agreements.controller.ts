import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  createAgreementRequestSchema,
  renewAgreementRequestSchema,
  terminateAgreementRequestSchema,
  type AgreementView,
} from '@witness/contracts';
import {
  AuthorizationGuard,
  Requires,
  type RequestWithPrincipal,
} from '../authz/authorization.guard.js';
import { AgreementsService } from './agreements.service.js';

@Controller('api/v1/organisations/:organisationId/agreements')
@UseGuards(AuthorizationGuard)
export class AgreementsController {
  constructor(private readonly agreements: AgreementsService) {}

  @Get()
  @Requires('agreement:read')
  list(
    @Param('organisationId', new ParseUUIDPipe()) organisationId: string,
  ): Promise<AgreementView[]> {
    return this.agreements.list(organisationId);
  }

  @Post()
  @Requires('agreement:create')
  create(
    @Param('organisationId', new ParseUUIDPipe()) organisationId: string,
    @Body() body: unknown,
    @Req() request: RequestWithPrincipal,
  ): Promise<AgreementView> {
    const parsed = createAgreementRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        error: {
          code: 'VALIDATION_FAILED',
          message: 'The agreement request is not valid.',
          fields: parsed.error.flatten().fieldErrors,
        },
      });
    }
    return this.agreements.create(organisationId, parsed.data, request.principal!);
  }

  @Post(':agreementId/renewals')
  @Requires('agreement:renew')
  renew(
    @Param('organisationId', new ParseUUIDPipe()) organisationId: string,
    @Param('agreementId', new ParseUUIDPipe()) agreementId: string,
    @Body() body: unknown,
    @Req() request: RequestWithPrincipal,
  ): Promise<AgreementView> {
    const parsed = renewAgreementRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        error: {
          code: 'VALIDATION_FAILED',
          message: 'The renewal request is not valid.',
          fields: parsed.error.flatten().fieldErrors,
        },
      });
    }
    return this.agreements.renew(organisationId, agreementId, parsed.data, request.principal!);
  }

  @Post(':agreementId/termination')
  @Requires('agreement:terminate')
  terminate(
    @Param('organisationId', new ParseUUIDPipe()) organisationId: string,
    @Param('agreementId', new ParseUUIDPipe()) agreementId: string,
    @Body() body: unknown,
    @Req() request: RequestWithPrincipal,
  ): Promise<AgreementView> {
    const parsed = terminateAgreementRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        error: {
          code: 'VALIDATION_FAILED',
          message: 'The termination request is not valid.',
          fields: parsed.error.flatten().fieldErrors,
        },
      });
    }
    return this.agreements.terminate(
      organisationId,
      agreementId,
      parsed.data.reason,
      request.principal!,
    );
  }
}
