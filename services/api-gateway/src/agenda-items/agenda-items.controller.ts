/**
 * HTTP adapter for program agenda items. Nested under `:workspaceId`, so
 * `AuthorizationGuard.resolveScope` Casbin-scopes every action the same way
 * as `WorkspacesController` — no guard change needed.
 */

import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';

import {
  createAgendaItemRequestSchema,
  agendaItemTransitionRequestSchema,
  reorderAgendaItemRequestSchema,
  updateAgendaItemRequestSchema,
  type AgendaItemView,
} from '@witness/contracts';
import { DomainError } from '@witness/domain';

import {
  AuthorizationGuard,
  Requires,
  type RequestWithPrincipal,
} from '../authz/authorization.guard.js';
import { AgendaItemsService } from './agenda-items.service.js';

@Controller('api/v1/workspaces/:workspaceId/agenda-items')
@UseGuards(AuthorizationGuard)
export class AgendaItemsController {
  constructor(private readonly agendaItems: AgendaItemsService) {}

  @Get()
  @Requires('agenda_item:read')
  async list(
    @Param('workspaceId') workspaceId: string,
  ): Promise<{ agendaItems: AgendaItemView[] }> {
    return { agendaItems: await this.agendaItems.list(workspaceId) };
  }

  @Post()
  @Requires('agenda_item:manage')
  async create(
    @Param('workspaceId') workspaceId: string,
    @Body() body: unknown,
    @Req() request: RequestWithPrincipal,
  ): Promise<AgendaItemView> {
    const parsed = createAgendaItemRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        error: {
          code: 'VALIDATION_FAILED',
          message: 'The request body is not valid.',
          fields: parsed.error.flatten().fieldErrors,
        },
      });
    }

    return this.translateDomainErrors(() =>
      this.agendaItems.create(workspaceId, parsed.data, request.principal!),
    );
  }

  @Patch(':itemId')
  @Requires('agenda_item:manage')
  async update(
    @Param('workspaceId') workspaceId: string,
    @Param('itemId') itemId: string,
    @Body() body: unknown,
    @Req() request: RequestWithPrincipal,
  ): Promise<AgendaItemView> {
    const parsed = updateAgendaItemRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        error: {
          code: 'VALIDATION_FAILED',
          message: 'The request body is not valid.',
          fields: parsed.error.flatten().fieldErrors,
        },
      });
    }

    return this.translateDomainErrors(() =>
      this.agendaItems.update(workspaceId, itemId, parsed.data, request.principal!),
    );
  }

  @Patch(':itemId/status')
  @Requires('agenda_item:manage')
  async transitionStatus(
    @Param('workspaceId') workspaceId: string,
    @Param('itemId') itemId: string,
    @Body() body: unknown,
    @Req() request: RequestWithPrincipal,
  ): Promise<AgendaItemView> {
    const parsed = agendaItemTransitionRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        error: {
          code: 'VALIDATION_FAILED',
          message: 'The request body is not valid.',
          fields: parsed.error.flatten().fieldErrors,
        },
      });
    }

    return this.translateDomainErrors(() =>
      this.agendaItems.transitionStatus(
        workspaceId,
        itemId,
        parsed.data.status,
        request.principal!,
      ),
    );
  }

  @Patch(':itemId/reorder')
  @Requires('agenda_item:manage')
  async reorder(
    @Param('workspaceId') workspaceId: string,
    @Param('itemId') itemId: string,
    @Body() body: unknown,
    @Req() request: RequestWithPrincipal,
  ): Promise<AgendaItemView> {
    const parsed = reorderAgendaItemRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        error: {
          code: 'VALIDATION_FAILED',
          message: 'The request body is not valid.',
          fields: parsed.error.flatten().fieldErrors,
        },
      });
    }

    return this.translateDomainErrors(() =>
      this.agendaItems.reorder(workspaceId, itemId, parsed.data, request.principal!),
    );
  }

  private async translateDomainErrors<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof DomainError) {
        throw new BadRequestException({ error: { code: error.code, message: error.message } });
      }
      throw error;
    }
  }
}
