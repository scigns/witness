/**
 * Program resource — a facilitator-uploaded presentation, briefing paper,
 * agenda, image, document, or external link (Client-Ready Experience
 * overhaul, Phase 12). Exactly one of "file" or "link" — a resource is
 * either bytes this deployment stores, or a URL it merely records, never
 * both and never neither.
 */

import { InvariantViolation } from './errors.js';
import type { Actor } from './actor.js';
import type { PendingAuditEvent } from './audit.js';
import type { AgendaItemId, CoDesignSessionId, ResourceId, UserId, WorkspaceId } from './ids.js';

export const RESOURCE_TYPES = ['file', 'link'] as const;
export type ResourceType = (typeof RESOURCE_TYPES)[number];

const TITLE_MAX = 300;
const DESCRIPTION_MAX = 2000;
const URL_MAX = 2000;
/** Matches `EvidenceAttachmentService`'s own cap — same storage, same limit. */
const FILE_MAX_BYTES = 50 * 1024 * 1024;

export interface FileResourceInput {
  readonly resourceType: 'file';
  readonly originalFilename: string;
  readonly contentType: string;
  readonly sizeBytes: number;
  readonly content: Buffer;
}

export interface LinkResourceInput {
  readonly resourceType: 'link';
  readonly externalUrl: string;
}

export interface Resource {
  readonly id: ResourceId;
  readonly workspaceId: WorkspaceId;
  readonly sessionId: CoDesignSessionId | null;
  readonly agendaItemId: AgendaItemId | null;
  readonly title: string;
  readonly description: string | null;
  readonly resourceType: ResourceType;
  readonly originalFilename: string | null;
  readonly contentType: string | null;
  readonly sizeBytes: number | null;
  readonly externalUrl: string | null;
  readonly uploadedById: UserId;
  readonly createdAt: Date;
}

export interface ResourceOutcome {
  readonly resource: Resource;
  readonly event: PendingAuditEvent;
}

function assertTitle(title: string): string {
  const trimmed = title.trim();
  if (trimmed.length === 0) {
    throw new InvariantViolation('A resource must have a title.', 'TITLE_REQUIRED');
  }
  if (trimmed.length > TITLE_MAX) {
    throw new InvariantViolation(
      `A resource title must be ${TITLE_MAX} characters or fewer.`,
      'TITLE_TOO_LONG',
    );
  }
  return trimmed;
}

function assertDescription(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > DESCRIPTION_MAX) {
    throw new InvariantViolation(
      `A resource description must be ${DESCRIPTION_MAX} characters or fewer.`,
      'DESCRIPTION_TOO_LONG',
    );
  }
  return trimmed;
}

function assertUrl(url: string): string {
  const trimmed = url.trim();
  if (trimmed.length === 0) {
    throw new InvariantViolation('A link resource must have a URL.', 'URL_REQUIRED');
  }
  if (trimmed.length > URL_MAX) {
    throw new InvariantViolation(
      `A resource URL must be ${URL_MAX} characters or fewer.`,
      'URL_TOO_LONG',
    );
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new InvariantViolation(`'${trimmed}' is not a valid URL.`, 'INVALID_URL');
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new InvariantViolation('A resource URL must use http or https.', 'INVALID_URL_SCHEME');
  }
  return trimmed;
}

export function createResource(input: {
  id: ResourceId;
  workspaceId: WorkspaceId;
  sessionId?: CoDesignSessionId | null;
  agendaItemId?: AgendaItemId | null;
  title: string;
  description?: string | null;
  content: FileResourceInput | LinkResourceInput;
  uploadedById: UserId;
  uploadedBy: Actor;
  createdAt: Date;
}): ResourceOutcome {
  if (input.content.resourceType === 'file' && input.content.sizeBytes > FILE_MAX_BYTES) {
    throw new InvariantViolation(
      `This file is ${Math.ceil(input.content.sizeBytes / (1024 * 1024))} MB. The limit is ${FILE_MAX_BYTES / (1024 * 1024)} MB.`,
      'FILE_TOO_LARGE',
    );
  }

  const resource: Resource = {
    id: input.id,
    workspaceId: input.workspaceId,
    sessionId: input.sessionId ?? null,
    agendaItemId: input.agendaItemId ?? null,
    title: assertTitle(input.title),
    description: assertDescription(input.description),
    resourceType: input.content.resourceType,
    originalFilename: input.content.resourceType === 'file' ? input.content.originalFilename : null,
    contentType: input.content.resourceType === 'file' ? input.content.contentType : null,
    sizeBytes: input.content.resourceType === 'file' ? input.content.sizeBytes : null,
    externalUrl:
      input.content.resourceType === 'link' ? assertUrl(input.content.externalUrl) : null,
    uploadedById: input.uploadedById,
    createdAt: input.createdAt,
  };

  return {
    resource,
    event: {
      action: 'resource.uploaded',
      actor: input.uploadedBy,
      metadata: {
        workspaceId: resource.workspaceId,
        title: resource.title,
        resourceType: resource.resourceType,
      },
    },
  };
}

export function removeResource(resource: Resource, removedBy: Actor): PendingAuditEvent {
  return {
    action: 'resource.removed',
    actor: removedBy,
    metadata: { workspaceId: resource.workspaceId, title: resource.title },
  };
}
