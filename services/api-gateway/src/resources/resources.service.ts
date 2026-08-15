/**
 * Application layer for program resources — presentations, briefing papers,
 * and links a facilitator makes available to a program (Client-Ready
 * Experience overhaul, Phase 12).
 *
 * Mirrors `EvidenceAttachmentService`'s file-handling shape exactly,
 * including where the bytes live (`content` in Postgres, or `storageKey` in
 * an S3-compatible store when `StoragePort` is available — see that file's
 * doc comment and `storage.port.ts`) and `ConsentTemplatesService`'s
 * read/write shape otherwise. Unlike an evidence attachment, a resource
 * carries no participant consent to check — it is facilitator-authored
 * material, not participant contribution.
 */

import { Inject, Injectable, NotFoundException, PayloadTooLargeException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import {
  createResource,
  removeResource,
  toAgendaItemId,
  toCoDesignSessionId,
  toResourceId,
  toUserId,
  toWorkspaceId,
  InvariantViolation,
  type PendingAuditEvent,
  type Resource,
} from '@witness/domain';
import type {
  CreateFileResourceMetadata,
  CreateLinkResourceRequest,
  ResourceView,
} from '@witness/contracts';

import { PrismaService } from '../infrastructure/prisma.service.js';
import { resolveActor } from '../infrastructure/actor.helper.js';
import { appendAuditEvent } from '../infrastructure/audit.helper.js';
import { StoragePort } from '../storage/storage.port.js';
import { objectKey, resolveStoredContent } from '../storage/storage.service.js';
import { StorageQuotaService } from '../organisations/storage-quota.service.js';
import type { Principal } from '../authz/authorization.port.js';

/** Matches `EvidenceAttachmentService`'s own default cap. */
const FILE_MAX_BYTES = 50 * 1024 * 1024;

export interface UploadedResourceFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

export interface ResourceContent {
  filename: string;
  contentType: string;
  content: Buffer;
}

type ResourceRow = Awaited<ReturnType<PrismaService['resource']['findFirstOrThrow']>> & {
  uploadedBy: { displayName: string };
};

@Injectable()
export class ResourcesService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(StoragePort) private readonly storage: StoragePort | null,
    private readonly storageQuota: StorageQuotaService,
  ) {}

  async list(workspaceId: string): Promise<ResourceView[]> {
    await this.requireWorkspace(workspaceId);

    const rows = await this.prisma.resource.findMany({
      where: { workspaceId },
      include: { uploadedBy: { select: { displayName: true } } },
      orderBy: { createdAt: 'desc' },
    });

    return rows.map(toView);
  }

  async createLink(
    workspaceId: string,
    request: CreateLinkResourceRequest,
    principal: Principal,
  ): Promise<ResourceView> {
    await this.requireWorkspace(workspaceId);
    const actor = await resolveActor(this.prisma, principal);
    const userId = await this.requirePrincipalUserId(principal);
    const now = new Date();

    const outcome = createResource({
      id: toResourceId(randomUUID()),
      workspaceId: toWorkspaceId(workspaceId),
      sessionId: request.sessionId ? toCoDesignSessionId(request.sessionId) : null,
      agendaItemId: request.agendaItemId ? toAgendaItemId(request.agendaItemId) : null,
      title: request.title,
      description: request.description ?? null,
      content: { resourceType: 'link', externalUrl: request.externalUrl },
      uploadedById: toUserId(userId),
      uploadedBy: actor,
      createdAt: now,
    });

    await this.persist(outcome.resource, outcome.event, now);
    return toView(await this.requireRow(workspaceId, outcome.resource.id));
  }

  async createFile(
    workspaceId: string,
    metadata: CreateFileResourceMetadata,
    file: UploadedResourceFile | undefined,
    principal: Principal,
  ): Promise<ResourceView> {
    if (file === undefined) {
      throw new PayloadTooLargeException({
        error: { code: 'FILE_REQUIRED', message: "No file was received in the 'file' field." },
      });
    }
    if (file.size > FILE_MAX_BYTES) {
      throw new PayloadTooLargeException({
        error: {
          code: 'FILE_TOO_LARGE',
          message:
            `This file is ${Math.ceil(file.size / (1024 * 1024))} MB. The limit is ` +
            `${FILE_MAX_BYTES / (1024 * 1024)} MB.`,
        },
      });
    }

    const workspace = await this.requireWorkspace(workspaceId);

    try {
      await this.storageQuota.checkQuota(workspace.organisationId, file.size);
    } catch (error) {
      if (error instanceof InvariantViolation && error.code === 'STORAGE_QUOTA_EXCEEDED') {
        throw new PayloadTooLargeException({
          error: { code: error.code, message: error.message },
        });
      }
      throw error;
    }

    const actor = await resolveActor(this.prisma, principal);
    const userId = await this.requirePrincipalUserId(principal);
    const now = new Date();
    const id = toResourceId(randomUUID());

    const outcome = createResource({
      id,
      workspaceId: toWorkspaceId(workspaceId),
      sessionId: metadata.sessionId ? toCoDesignSessionId(metadata.sessionId) : null,
      agendaItemId: metadata.agendaItemId ? toAgendaItemId(metadata.agendaItemId) : null,
      title: metadata.title,
      description: metadata.description ?? null,
      content: {
        resourceType: 'file',
        originalFilename: file.originalname,
        contentType: file.mimetype,
        sizeBytes: file.size,
        content: file.buffer,
      },
      uploadedById: toUserId(userId),
      uploadedBy: actor,
      createdAt: now,
    });

    // Same ordering as EvidenceAttachmentService: written before the
    // transaction, so a failed put never leaves a committed row pointing at
    // an object that does not exist.
    let storageKey: string | null = null;
    if (this.storage !== null) {
      storageKey = objectKey({ organisationId: workspace.organisationId, kind: 'resource', id });
      await this.storage.put(storageKey, file.buffer, file.mimetype);
    }

    await this.persist(outcome.resource, outcome.event, now, {
      content: storageKey === null ? file.buffer : null,
      storageKey,
    });
    return toView(await this.requireRow(workspaceId, outcome.resource.id));
  }

  async content(workspaceId: string, resourceId: string): Promise<ResourceContent> {
    const row = await this.requireRow(workspaceId, resourceId);

    if (row.resourceType !== 'file' || (row.content === null && row.storageKey === null)) {
      throw new NotFoundException({
        error: {
          code: 'RESOURCE_NOT_A_FILE',
          message: `Resource '${resourceId}' is a link, not a file.`,
        },
      });
    }

    let content: Buffer;
    try {
      content = await resolveStoredContent(this.storage, row);
    } catch (error) {
      throw new NotFoundException({
        error: {
          code: 'RESOURCE_NOT_FOUND',
          message: error instanceof Error ? error.message : String(error),
        },
      });
    }

    return {
      filename: row.originalFilename ?? row.title,
      contentType: row.contentType ?? 'application/octet-stream',
      content,
    };
  }

  async remove(workspaceId: string, resourceId: string, principal: Principal): Promise<void> {
    const row = await this.requireRow(workspaceId, resourceId);
    const actor = await resolveActor(this.prisma, principal);
    const event = removeResource(toDomain(row), actor);
    const now = new Date();

    // Deleted before the transaction, mirroring createFile's own ordering
    // rationale in reverse: a failed object delete must leave the DB row
    // intact (safe to retry) rather than committing a row-gone state while
    // the object silently survives in R2 forever — the orphan this file
    // shipped with until a live pilot upload proved it (see PR history).
    if (row.storageKey !== null && this.storage !== null) {
      await this.storage.delete(row.storageKey);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.resource.delete({ where: { id: resourceId } });
      await appendAuditEvent(tx, 'resource', resourceId, event, now);
    });
  }

  private async persist(
    resource: Resource,
    event: PendingAuditEvent,
    at: Date,
    storage?: { content: Buffer | null; storageKey: string | null },
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.resource.create({
        data: {
          id: resource.id,
          workspaceId: resource.workspaceId,
          sessionId: resource.sessionId,
          agendaItemId: resource.agendaItemId,
          title: resource.title,
          description: resource.description,
          resourceType: resource.resourceType,
          originalFilename: resource.originalFilename,
          contentType: resource.contentType,
          sizeBytes: resource.sizeBytes,
          content: storage?.content ?? null,
          storageKey: storage?.storageKey ?? null,
          externalUrl: resource.externalUrl,
          uploadedById: resource.uploadedById,
          createdAt: resource.createdAt,
        },
      });
      await appendAuditEvent(tx, 'resource', resource.id, event, at);
    });
  }

  /** A resource is uploaded by a signed-in user — the dev-header path has no such row to attach to. */
  private async requirePrincipalUserId(principal: Principal): Promise<string> {
    if (principal.subject.startsWith('user:')) {
      return principal.subject.slice('user:'.length);
    }

    const user = await this.prisma.user.findFirst({
      where: { displayName: principal.displayName },
      select: { id: true },
    });

    if (user === null) {
      throw new NotFoundException({
        error: { code: 'USER_NOT_FOUND', message: 'No user record for the current principal.' },
      });
    }

    return user.id;
  }

  private async requireWorkspace(workspaceId: string): Promise<{ organisationId: string }> {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { organisationId: true },
    });

    if (workspace === null) {
      throw new NotFoundException({
        error: { code: 'WORKSPACE_NOT_FOUND', message: `No workspace with id '${workspaceId}'.` },
      });
    }

    return workspace;
  }

  private async requireRow(workspaceId: string, resourceId: string): Promise<ResourceRow> {
    const row = await this.prisma.resource.findUnique({
      where: { id: resourceId },
      include: { uploadedBy: { select: { displayName: true } } },
    });

    if (row === null || row.workspaceId !== workspaceId) {
      throw new NotFoundException({
        error: {
          code: 'RESOURCE_NOT_FOUND',
          message: `No resource '${resourceId}' in workspace '${workspaceId}'.`,
        },
      });
    }

    return row;
  }
}

function toDomain(row: {
  id: string;
  workspaceId: string;
  sessionId: string | null;
  agendaItemId: string | null;
  title: string;
  description: string | null;
  resourceType: string;
  originalFilename: string | null;
  contentType: string | null;
  sizeBytes: number | null;
  externalUrl: string | null;
  uploadedById: string;
  createdAt: Date;
}): Resource {
  return {
    id: toResourceId(row.id),
    workspaceId: toWorkspaceId(row.workspaceId),
    sessionId: row.sessionId !== null ? toCoDesignSessionId(row.sessionId) : null,
    agendaItemId: row.agendaItemId !== null ? toAgendaItemId(row.agendaItemId) : null,
    title: row.title,
    description: row.description,
    resourceType: row.resourceType as Resource['resourceType'],
    originalFilename: row.originalFilename,
    contentType: row.contentType,
    sizeBytes: row.sizeBytes,
    externalUrl: row.externalUrl,
    uploadedById: toUserId(row.uploadedById),
    createdAt: row.createdAt,
  };
}

function toView(row: ResourceRow): ResourceView {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    sessionId: row.sessionId,
    agendaItemId: row.agendaItemId,
    title: row.title,
    description: row.description,
    resourceType: row.resourceType as ResourceView['resourceType'],
    originalFilename: row.originalFilename,
    contentType: row.contentType,
    sizeBytes: row.sizeBytes,
    externalUrl: row.externalUrl,
    uploadedById: row.uploadedById,
    uploadedByName: row.uploadedBy.displayName,
    createdAt: row.createdAt.toISOString(),
  };
}
