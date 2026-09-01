import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';

import {
  grantPlatformRoleRequestSchema,
  revokePlatformRoleRequestSchema,
  type PlatformRoleAssignmentView,
} from '@witness/contracts';

import {
  AuthorizationGuard,
  Requires,
  type RequestWithPrincipal,
} from '../authz/authorization.guard.js';
import { PlatformRolesService } from './platform-roles.service.js';

@Controller('api/v1/platform/role-assignments')
@UseGuards(AuthorizationGuard)
export class PlatformRolesController {
  constructor(private readonly roles: PlatformRolesService) {}

  @Get()
  @Requires('platform_role:read')
  async list(): Promise<{ assignments: PlatformRoleAssignmentView[] }> {
    return { assignments: await this.roles.list() };
  }

  @Post()
  @Requires('platform_role:write')
  async grant(@Body() body: unknown, @Req() request: RequestWithPrincipal) {
    const parsed = grantPlatformRoleRequestSchema.safeParse(body);
    if (!parsed.success) throw validationError(parsed.error.flatten().fieldErrors);
    return this.roles.grant(parsed.data, request.principal!);
  }

  @Delete(':userId')
  @HttpCode(204)
  @Requires('platform_role:delete')
  async revoke(
    @Param('userId') userId: string,
    @Body() body: unknown,
    @Req() request: RequestWithPrincipal,
  ): Promise<void> {
    const parsed = revokePlatformRoleRequestSchema.safeParse(body);
    if (!parsed.success) throw validationError(parsed.error.flatten().fieldErrors);
    await this.roles.revoke(userId, parsed.data, request.principal!);
  }
}

function validationError(fields: Record<string, string[] | undefined>) {
  return new BadRequestException({
    error: { code: 'VALIDATION_FAILED', message: 'The request body is not valid.', fields },
  });
}
