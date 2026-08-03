/**
 * The static role catalog — same set of roles and permitted actions
 * everywhere, so an administrator can see what a role means before
 * assigning it.
 */

import { Controller, Get, UseGuards } from '@nestjs/common';

import type { RoleDefinition } from '@witness/contracts';

import { AuthorizationGuard, Requires } from '../authz/authorization.guard.js';
import { roleCatalog } from '../infrastructure/role.helper.js';

@Controller('api/v1/roles')
@UseGuards(AuthorizationGuard)
export class RolesController {
  @Get()
  @Requires('role:read')
  list(): { roles: RoleDefinition[] } {
    return { roles: roleCatalog() };
  }
}
