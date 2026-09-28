import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';

import {
  editCustomerStoryWordingRequestSchema,
  moderateCustomerStoryRequestSchema,
  type CustomerStoryView,
} from '@witness/contracts';

import {
  AuthorizationGuard,
  Requires,
  type RequestWithPrincipal,
} from '../authz/authorization.guard.js';
import { CustomerStoriesService } from './customer-stories.service.js';

function validationError(message: string, fields: Record<string, string[] | undefined>) {
  return new BadRequestException({ error: { code: 'VALIDATION_FAILED', message, fields } });
}

@Controller('api/v1/workspaces/:workspaceId/customer-stories')
@UseGuards(AuthorizationGuard)
export class CustomerStoriesController {
  constructor(private readonly stories: CustomerStoriesService) {}

  @Get()
  @Requires('customer_story:read')
  list(
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
    @Req() request: RequestWithPrincipal,
  ): Promise<CustomerStoryView[]> {
    return this.stories.listForWorkspace(workspaceId, request.principal!);
  }

  @Patch(':storyId/wording')
  @Requires('customer_story:moderate')
  editWording(
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
    @Param('storyId', new ParseUUIDPipe()) storyId: string,
    @Body() body: unknown,
    @Req() request: RequestWithPrincipal,
  ): Promise<CustomerStoryView> {
    const parsed = editCustomerStoryWordingRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw validationError(
        'The wording request is not valid.',
        parsed.error.flatten().fieldErrors,
      );
    }
    return this.stories.editWording(workspaceId, storyId, parsed.data, request.principal!);
  }

  @Post(':storyId/moderation')
  @Requires('customer_story:moderate')
  moderate(
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
    @Param('storyId', new ParseUUIDPipe()) storyId: string,
    @Body() body: unknown,
    @Req() request: RequestWithPrincipal,
  ): Promise<CustomerStoryView> {
    const parsed = moderateCustomerStoryRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw validationError(
        'The moderation request is not valid.',
        parsed.error.flatten().fieldErrors,
      );
    }
    return this.stories.moderate(workspaceId, storyId, parsed.data, request.principal!);
  }

  @Post(':storyId/publication')
  @Requires('customer_story:publish')
  publish(
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
    @Param('storyId', new ParseUUIDPipe()) storyId: string,
    @Req() request: RequestWithPrincipal,
  ): Promise<CustomerStoryView> {
    return this.stories.publish(workspaceId, storyId, request.principal!);
  }

  @Delete(':storyId/publication')
  @Requires('customer_story:publish')
  unpublish(
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
    @Param('storyId', new ParseUUIDPipe()) storyId: string,
    @Req() request: RequestWithPrincipal,
  ): Promise<CustomerStoryView> {
    return this.stories.unpublish(workspaceId, storyId, request.principal!);
  }

  @Delete(':storyId/consent')
  @Requires('customer_story:moderate')
  withdrawConsent(
    @Param('workspaceId', new ParseUUIDPipe()) workspaceId: string,
    @Param('storyId', new ParseUUIDPipe()) storyId: string,
    @Req() request: RequestWithPrincipal,
  ): Promise<CustomerStoryView> {
    return this.stories.withdrawConsent(workspaceId, storyId, request.principal!);
  }
}
