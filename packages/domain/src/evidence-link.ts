/**
 * EvidenceLink (BUILD_ROADMAP.md Milestone 5, Structured Live Evidence
 * Capture) — a typed relationship between two pieces of evidence within the
 * same session.
 *
 * Deliberately its own aggregate rather than a field on `Evidence`: a link
 * has its own actor (who noticed the relationship, which may differ from
 * who captured either side), its own audit trail, and — unlike evidence
 * itself — a genuine delete (`removeEvidenceLink`), because a mistaken link
 * is noise, not history. That is the one place this milestone's "no
 * destructive deletion" rule does not apply: it governs evidence *content*
 * (someone's words), not bookkeeping about which two rows are related.
 *
 * Same conventions as every other aggregate in this package: immutable,
 * mutation returns a new value plus a `PendingAuditEvent`, identifiers/clock
 * are injected (ADR-0003).
 */

import { InvariantViolation } from './errors.js';
import type { Actor } from './actor.js';
import type { PendingAuditEvent } from './audit.js';
import type {
  CoDesignSessionId,
  EvidenceId,
  EvidenceLinkId,
  OrganisationId,
  WorkspaceId,
} from './ids.js';

/**
 * `supports`/`contradicts`/`clarifies` describe how one piece of evidence
 * bears on another's content; `duplicates` marks the same point captured
 * twice (by different participants, or the same one in different words);
 * `follows_from` orders a later point as building on an earlier one;
 * `related_to` is the catch-all for a connection worth recording without a
 * more specific claim.
 */
export const EVIDENCE_LINK_TYPES = [
  'supports',
  'contradicts',
  'clarifies',
  'duplicates',
  'follows_from',
  'related_to',
] as const;
export type EvidenceLinkType = (typeof EVIDENCE_LINK_TYPES)[number];

export interface EvidenceLink {
  readonly id: EvidenceLinkId;
  readonly organisationId: OrganisationId;
  readonly workspaceId: WorkspaceId;
  readonly sessionId: CoDesignSessionId;
  readonly linkType: EvidenceLinkType;
  readonly fromEvidenceId: EvidenceId;
  readonly toEvidenceId: EvidenceId;
  readonly note: string | null;
  readonly createdAt: Date;
  readonly createdBy: Actor;
}

export interface EvidenceLinkOutcome {
  readonly link: EvidenceLink;
  readonly event: PendingAuditEvent;
}

const NOTE_MAX = 1000;

function assertLinkType(value: string): EvidenceLinkType {
  if (!(EVIDENCE_LINK_TYPES as readonly string[]).includes(value)) {
    throw new InvariantViolation(
      `'${value}' is not a recognised evidence link type.`,
      'INVALID_EVIDENCE_LINK_TYPE',
    );
  }
  return value as EvidenceLinkType;
}

function assertNote(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > NOTE_MAX) {
    throw new InvariantViolation(
      `A link note must be ${NOTE_MAX} characters or fewer, received ${trimmed.length}.`,
      'EVIDENCE_LINK_NOTE_TOO_LONG',
    );
  }
  return trimmed;
}

/**
 * Minimal shape `assertLinkable` needs from each side of a candidate link —
 * just enough to check scope and identity, not the full `Evidence`
 * aggregate, so the service layer can pass two lightweight row summaries
 * without reconstructing both domain objects.
 */
export interface LinkableEvidenceRef {
  readonly id: EvidenceId;
  readonly organisationId: OrganisationId;
  readonly workspaceId: WorkspaceId;
  readonly sessionId: CoDesignSessionId;
}

/**
 * Reject everything the milestone requires rejecting before a link is ever
 * constructed: linking evidence to itself, linking across sessions (a link
 * only makes sense within the shared context both pieces were captured in),
 * and — belt and braces, since the service layer should already have scoped
 * both lookups — linking across workspace or organisation boundaries.
 *
 * Duplicate-link rejection is NOT here: it requires knowing what links
 * already exist, which is a database read the domain may not perform
 * (ADR-0003). `EvidenceLinkService` checks that before calling
 * `createEvidenceLink`.
 */
function assertLinkable(from: LinkableEvidenceRef, to: LinkableEvidenceRef): void {
  if (from.id === to.id) {
    throw new InvariantViolation('Evidence cannot be linked to itself.', 'EVIDENCE_LINK_SELF');
  }
  if (from.organisationId !== to.organisationId) {
    throw new InvariantViolation(
      'Evidence cannot be linked across organisations.',
      'EVIDENCE_LINK_CROSS_ORGANISATION',
    );
  }
  if (from.workspaceId !== to.workspaceId) {
    throw new InvariantViolation(
      'Evidence cannot be linked across workspaces.',
      'EVIDENCE_LINK_CROSS_WORKSPACE',
    );
  }
  if (from.sessionId !== to.sessionId) {
    throw new InvariantViolation(
      'Evidence cannot be linked across sessions.',
      'EVIDENCE_LINK_CROSS_SESSION',
    );
  }
}

export interface CreateEvidenceLinkInput {
  id: EvidenceLinkId;
  linkType: string;
  from: LinkableEvidenceRef;
  to: LinkableEvidenceRef;
  note?: string | null | undefined;
  createdBy: Actor;
  at: Date;
}

export function createEvidenceLink(input: CreateEvidenceLinkInput): EvidenceLinkOutcome {
  assertLinkable(input.from, input.to);
  const linkType = assertLinkType(input.linkType);

  const link: EvidenceLink = {
    id: input.id,
    organisationId: input.from.organisationId,
    workspaceId: input.from.workspaceId,
    sessionId: input.from.sessionId,
    linkType,
    fromEvidenceId: input.from.id,
    toEvidenceId: input.to.id,
    note: assertNote(input.note),
    createdAt: input.at,
    createdBy: input.createdBy,
  };

  return {
    link,
    event: {
      action: 'evidence_link.created',
      actor: input.createdBy,
      metadata: {
        sessionId: link.sessionId,
        linkType: link.linkType,
        fromEvidenceId: link.fromEvidenceId,
        toEvidenceId: link.toEvidenceId,
      },
    },
  };
}

/**
 * Remove a link — a genuine delete, not a withdrawal. See the file header
 * for why this aggregate is the one exception to the milestone's
 * no-destructive-deletion rule.
 */
export function removeEvidenceLink(link: EvidenceLink, removedBy: Actor): PendingAuditEvent {
  return {
    action: 'evidence_link.removed',
    actor: removedBy,
    metadata: {
      sessionId: link.sessionId,
      linkType: link.linkType,
      fromEvidenceId: link.fromEvidenceId,
      toEvidenceId: link.toEvidenceId,
    },
  };
}
