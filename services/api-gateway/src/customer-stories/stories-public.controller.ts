/**
 * The public, unauthenticated read `apps/marketing`'s stories page fetches
 * server-side. Deliberately NOT behind `AuthorizationGuard` — mirrors
 * `HealthController`/`SessionJoinController`'s "a route simply never adds
 * `@UseGuards(AuthorizationGuard)`" pattern (no `@Public()` decorator exists
 * in this codebase; see `authorization.guard.ts`'s own file header). Only
 * `CustomerStoriesService.listPublished()` — already scoped to
 * approved + published + consent-not-withdrawn rows — is reachable here.
 */

import { Controller, Get } from '@nestjs/common';

import type { PublishedStoryCard } from '@witness/contracts';

import { CustomerStoriesService } from './customer-stories.service.js';

@Controller('api/v1/stories')
export class StoriesPublicController {
  constructor(private readonly stories: CustomerStoriesService) {}

  @Get('published')
  list(): Promise<PublishedStoryCard[]> {
    return this.stories.listPublished();
  }
}
