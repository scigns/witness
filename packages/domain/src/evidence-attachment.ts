/**
 * EvidenceAttachment — the source file (an audio recording, to start) backing
 * one piece of `Evidence`.
 *
 * `Evidence.content` is a plain, human-authored text field (see
 * `evidence.ts`'s file header) — it has never had anywhere to put the actual
 * audio a facilitator captured during a session. This is that place: a
 * separate aggregate, one per `Evidence` row, immutable once captured. There
 * is no edit or replace here, on purpose — the underlying recording is
 * source material, not a draft; if it was captured wrong, the fix is
 * withdrawing the `Evidence` it belongs to, not silently swapping the file
 * an audit trail already points at.
 *
 * Bytes live in the same Postgres database as everything else (ADR-0011):
 * the system of record is one thing, `scripts/ops/backup.sh` already backs
 * all of it up, and a second, unbacked-up storage location for source media
 * is exactly the kind of quiet data-loss risk that principle exists to rule
 * out. Content-type and size are validated here so nothing arrives at
 * storage that the product does not yet know how to play back or that could
 * exhaust it.
 */

import { InvariantViolation } from './errors.js';
import type { Actor } from './actor.js';
import type { PendingAuditEvent } from './audit.js';
import type { EvidenceAttachmentId, EvidenceId } from './ids.js';

export const ATTACHMENT_KINDS = ['audio'] as const;
export type AttachmentKind = (typeof ATTACHMENT_KINDS)[number];

/**
 * Deliberately narrow — one well-supported container/codec combination per
 * kind that a browser's own `<audio>` element can play back with no
 * transcoding step, rather than accepting anything a recorder might produce.
 */
const ALLOWED_CONTENT_TYPES: Readonly<Record<AttachmentKind, readonly string[]>> = Object.freeze({
  audio: [
    'audio/mpeg',
    'audio/mp4',
    'audio/aac',
    'audio/wav',
    'audio/x-wav',
    'audio/webm',
    'audio/ogg',
  ],
});

const ORIGINAL_FILENAME_MAX = 300;

export interface EvidenceAttachment {
  readonly id: EvidenceAttachmentId;
  readonly evidenceId: EvidenceId;
  readonly kind: AttachmentKind;
  /** As the browser reported it — display only, never used to derive a storage path. */
  readonly originalFilename: string;
  readonly contentType: string;
  readonly sizeBytes: number;
  /** sha256 of the exact bytes stored, so a caller can verify nothing was altered in transit or at rest. */
  readonly checksumSha256: string;
  readonly createdAt: Date;
}

export interface EvidenceAttachmentOutcome {
  readonly attachment: EvidenceAttachment;
  readonly event: PendingAuditEvent;
}

function assertFilename(name: string): string {
  const trimmed = name.trim();

  if (trimmed.length === 0) {
    throw new InvariantViolation('An attachment must have a filename.', 'FILENAME_REQUIRED');
  }

  if (trimmed.length > ORIGINAL_FILENAME_MAX) {
    throw new InvariantViolation(
      `A filename must be ${ORIGINAL_FILENAME_MAX} characters or fewer, received ${trimmed.length}.`,
      'FILENAME_TOO_LONG',
    );
  }

  return trimmed;
}

export function assertSupportedContentType(kind: AttachmentKind, contentType: string): void {
  if (!ALLOWED_CONTENT_TYPES[kind].includes(contentType)) {
    throw new InvariantViolation(
      `'${contentType}' is not a supported ${kind} format. Supported: ` +
        `${ALLOWED_CONTENT_TYPES[kind].join(', ')}.`,
      'UNSUPPORTED_CONTENT_TYPE',
    );
  }
}

/** Registers one captured file against an already-existing `Evidence` row. */
export function captureEvidenceAttachment(input: {
  id: EvidenceAttachmentId;
  evidenceId: EvidenceId;
  kind: AttachmentKind;
  originalFilename: string;
  contentType: string;
  sizeBytes: number;
  checksumSha256: string;
  capturedBy: Actor;
  at: Date;
}): EvidenceAttachmentOutcome {
  assertSupportedContentType(input.kind, input.contentType);

  if (input.sizeBytes <= 0) {
    throw new InvariantViolation('An attachment must not be empty.', 'EMPTY_FILE');
  }

  const attachment: EvidenceAttachment = {
    id: input.id,
    evidenceId: input.evidenceId,
    kind: input.kind,
    originalFilename: assertFilename(input.originalFilename),
    contentType: input.contentType,
    sizeBytes: input.sizeBytes,
    checksumSha256: input.checksumSha256,
    createdAt: input.at,
  };

  return {
    attachment,
    event: {
      action: 'evidence_attachment.captured',
      actor: input.capturedBy,
      metadata: {
        evidenceId: attachment.evidenceId,
        kind: attachment.kind,
        originalFilename: attachment.originalFilename,
        contentType: attachment.contentType,
        sizeBytes: String(attachment.sizeBytes),
        checksumSha256: attachment.checksumSha256,
      },
    },
  };
}
