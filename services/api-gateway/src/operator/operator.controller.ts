import { Controller, Get, UseGuards } from '@nestjs/common';

import type { OperatorHealthView } from '@witness/contracts';

import { AuthorizationGuard, Requires } from '../authz/authorization.guard.js';
import { OperatorService } from './operator.service.js';

@Controller('api/v1/operator')
@UseGuards(AuthorizationGuard)
export class OperatorController {
  constructor(private readonly operator: OperatorService) {}

  @Get('health')
  @Requires('operator:read')
  health(): Promise<OperatorHealthView> {
    return this.operator.health();
  }
}
