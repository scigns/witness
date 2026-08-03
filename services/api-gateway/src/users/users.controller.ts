/**
 * HTTP adapter for users. Mirrors `OrganisationsController`: parse, authorise,
 * delegate, serialise — no rule is expressed here that is not also expressed in
 * the domain (ADR-0003).
 */

import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';

import { createUserRequestSchema, type UserSummary } from '@witness/contracts';
import { DomainError } from '@witness/domain';

import {
  AuthorizationGuard,
  Requires,
  type RequestWithPrincipal,
} from '../authz/authorization.guard.js';
import { UsersService } from './users.service.js';

@Controller('api/v1/users')
@UseGuards(AuthorizationGuard)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @Requires('user:read')
  async list(): Promise<{ users: UserSummary[] }> {
    return { users: await this.users.list() };
  }

  @Get(':id')
  @Requires('user:read')
  async get(@Param('id') id: string): Promise<UserSummary> {
    return this.users.get(id);
  }

  @Post()
  @Requires('user:create')
  async create(@Body() body: unknown, @Req() request: RequestWithPrincipal): Promise<UserSummary> {
    const parsed = createUserRequestSchema.safeParse(body);

    if (!parsed.success) {
      throw new BadRequestException({
        error: {
          code: 'VALIDATION_FAILED',
          message: 'The request body is not valid.',
          fields: parsed.error.flatten().fieldErrors,
        },
      });
    }

    try {
      return await this.users.create(parsed.data, request.principal!);
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
