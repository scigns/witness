/**
 * HTTP adapter for search — gated by `session:read`, the broadest read
 * action already granted to every tier in this workspace's scope. Search
 * surfaces nothing an ordinary reader could not already reach by browsing
 * each register individually.
 */

import {
  BadRequestException,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';

import type { SearchResultView } from '@witness/contracts';

import { AuthorizationGuard, Requires } from '../authz/authorization.guard.js';
import { SearchService } from './search.service.js';

const MIN_QUERY_LENGTH = 2;
const MAX_QUERY_LENGTH = 200;

@Controller('api/v1/workspaces/:workspaceId/search')
@UseGuards(AuthorizationGuard)
export class SearchController {
  constructor(private readonly search: SearchService) {}

  @Get()
  @Requires('session:read')
  async run(
    @Param('workspaceId', ParseUUIDPipe) workspaceId: string,
    @Query('q') rawQuery: string | undefined,
  ): Promise<{ results: SearchResultView[] }> {
    const query = (rawQuery ?? '').trim();

    if (query.length < MIN_QUERY_LENGTH || query.length > MAX_QUERY_LENGTH) {
      throw new BadRequestException({
        error: {
          code: 'VALIDATION_FAILED',
          message: `The search text must be between ${MIN_QUERY_LENGTH} and ${MAX_QUERY_LENGTH} characters.`,
        },
      });
    }

    return { results: await this.search.search(workspaceId, query) };
  }
}
