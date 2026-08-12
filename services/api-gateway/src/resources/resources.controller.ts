/**
 * HTTP adapter for program resources. Nested under `:workspaceId`, mirroring
 * `AgendaItemsController`. File upload/download follows
 * `EvidenceController`'s exact multipart + streamed-download shape.
 */

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
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';

import {
  createFileResourceMetadataSchema,
  createLinkResourceRequestSchema,
  type ResourceView,
} from '@witness/contracts';
import { DomainError } from '@witness/domain';

import {
  AuthorizationGuard,
  Requires,
  type RequestWithPrincipal,
} from '../authz/authorization.guard.js';
import { ResourcesService } from './resources.service.js';

/** Memory-safety backstop, not the product limit — see `ResourcesService`'s own cap. */
const MULTER_HARD_CEILING_BYTES = 100 * 1024 * 1024;

@Controller('api/v1/workspaces/:workspaceId/resources')
@UseGuards(AuthorizationGuard)
export class ResourcesController {
  constructor(private readonly resources: ResourcesService) {}

  @Get()
  @Requires('resource:read')
  async list(@Param('workspaceId') workspaceId: string): Promise<{ resources: ResourceView[] }> {
    return { resources: await this.resources.list(workspaceId) };
  }

  @Post('link')
  @Requires('resource:manage')
  async createLink(
    @Param('workspaceId') workspaceId: string,
    @Body() body: unknown,
    @Req() request: RequestWithPrincipal,
  ): Promise<ResourceView> {
    const parsed = createLinkResourceRequestSchema.safeParse(body);
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
      this.resources.createLink(workspaceId, parsed.data, request.principal!),
    );
  }

  @Post('file')
  @Requires('resource:manage')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MULTER_HARD_CEILING_BYTES } }))
  async createFile(
    @Param('workspaceId') workspaceId: string,
    @Body() body: unknown,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Req() request: RequestWithPrincipal,
  ): Promise<ResourceView> {
    const parsed = createFileResourceMetadataSchema.safeParse(body);
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
      this.resources.createFile(workspaceId, parsed.data, file, request.principal!),
    );
  }

  @Get(':resourceId/content')
  @Requires('resource:read')
  async downloadContent(
    @Param('workspaceId') workspaceId: string,
    @Param('resourceId') resourceId: string,
    @Res() res: Response,
  ): Promise<void> {
    const file = await this.resources.content(workspaceId, resourceId);
    res.set({
      'Content-Type': file.contentType,
      'Content-Disposition':
        `attachment; filename="${file.filename.replace(/"/g, '')}"; ` +
        `filename*=UTF-8''${encodeURIComponent(file.filename)}`,
      'Content-Length': String(file.content.length),
    });
    res.send(file.content);
  }

  @Delete(':resourceId')
  @Requires('resource:manage')
  @HttpCode(204)
  async remove(
    @Param('workspaceId') workspaceId: string,
    @Param('resourceId') resourceId: string,
    @Req() request: RequestWithPrincipal,
  ): Promise<void> {
    await this.resources.remove(workspaceId, resourceId, request.principal!);
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
