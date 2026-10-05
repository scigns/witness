import {
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';

import type { OperatorHealthView } from '@witness/contracts';

import { AuthorizationGuard, Requires } from '../authz/authorization.guard.js';
import { OperatorService } from './operator.service.js';
import { PrismaService } from '../infrastructure/prisma.service.js';
import { CommercialCatalogueService } from '../commercial/commercial-catalogue.service.js';

@Controller('api/v1/operator')
@UseGuards(AuthorizationGuard)
export class OperatorController {
  constructor(
    private readonly operator: OperatorService,
    private readonly prisma: PrismaService,
    private readonly commercial: CommercialCatalogueService,
  ) {}

  @Get('organisations')
  @Requires('operator:read')
  async organisations() {
    const rows = await this.prisma.organisation.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: { id: true, name: true, profile: true, createdAt: true },
    });
    return {
      organisations: rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })),
    };
  }

  @Get('organisations/:organisationId/origination')
  @Requires('operator:read')
  async origination(@Param('organisationId', new ParseUUIDPipe()) organisationId: string) {
    const account = await this.prisma.billingAccount.findUnique({
      where: { organisationId },
      select: { id: true, currency: true },
    });
    const organisation = await this.prisma.organisation.findUnique({
      where: { id: organisationId },
      select: { id: true, name: true },
    });
    if (account === null || organisation === null)
      throw new NotFoundException('Organisation billing account not found.');
    return {
      organisation,
      billingAccount: account,
      billing: await this.commercial.overview(organisationId),
    };
  }

  @Get('health')
  @Requires('operator:read')
  health(): Promise<OperatorHealthView> {
    return this.operator.health();
  }
}
