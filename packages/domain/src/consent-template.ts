/**
 * ConsentTemplate (BUILD_ROADMAP.md Milestone 4, Consent Management) — a
 * versioned, organisation-defined statement of what a co-design session may
 * ask a participant to agree to, and in what categories.
 *
 * Same shape as every other aggregate in this package: immutable, mutation
 * returns a new value plus a `PendingAuditEvent`, the application layer
 * supplies the identifier, clock and persistence (ADR-0003).
 *
 * Versioning is structural, not a mutable field: each `ConsentTemplate` row
 * IS one immutable version. `familyId` groups every version that is
 * conceptually "the same template" — `createNewTemplateVersion` produces a
 * new row sharing the previous version's `familyId`, never edits the old
 * one. There is deliberately no "update template" function anywhere in this
 * module: "template versions must be immutable once used by a session" is
 * enforced by there being nothing to call that would violate it, not by a
 * runtime guard that could be forgotten on some other code path.
 *
 * `categories` is a free-form list of `{ category, required }` pairs, not a
 * closed enum — `CONSENT_CATEGORIES` below names the well-known set
 * `ConsentPolicyService` (services/api-gateway) knows how to answer
 * structured questions about (may audio be recorded, may this be
 * published, ...), but a template may declare additional
 * organisation-specific category strings alongside them. Declaring an
 * unknown category does not weaken the well-known ones — the decision
 * service's structured questions are hardcoded to the well-known
 * categories and cannot be redefined by template content.
 */

import { InvariantViolation } from './errors.js';
import type { Actor } from './actor.js';
import type { PendingAuditEvent } from './audit.js';
import type { ConsentTemplateId, OrganisationId, WorkspaceId } from './ids.js';

const NAME_MAX = 200;
const PURPOSE_MAX = 2000;
const DESCRIPTION_MAX = 5000;
const PLAIN_LANGUAGE_SUMMARY_MAX = 5000;
const CATEGORY_MAX = 100;
const LANGUAGE_MAX = 50;
const LANGUAGES_MAX_COUNT = 20;
const CATEGORIES_MAX_COUNT = 40;

/**
 * The well-known categories `ConsentPolicyService` can answer structured
 * questions about. A template's own `categories` list may include these,
 * organisation-defined ones, or both — see the file header.
 */
export const CONSENT_CATEGORIES = [
  'participation',
  'audio_recording',
  'video_recording',
  'photography',
  'evidence_submission',
  'transcription',
  'ai_processing',
  'attributed_quotation',
  'anonymous_quotation',
  'internal_use',
  'external_reporting',
  'publication',
  'research_use',
  'future_reuse',
  'knowledge_graph_inclusion',
  'follow_up_contact',
] as const;
export type ConsentCategory = (typeof CONSENT_CATEGORIES)[number];

export const CONSENT_TEMPLATE_STATUSES = ['draft', 'active', 'retired'] as const;
export type ConsentTemplateStatus = (typeof CONSENT_TEMPLATE_STATUSES)[number];

export interface ConsentTemplateCategory {
  readonly category: string;
  readonly required: boolean;
}

export interface ConsentTemplate {
  readonly id: ConsentTemplateId;
  readonly familyId: string;
  readonly organisationId: OrganisationId;
  readonly workspaceId: WorkspaceId | null;
  readonly name: string;
  readonly purpose: string;
  readonly description: string | null;
  readonly version: number;
  readonly status: ConsentTemplateStatus;
  readonly plainLanguageSummary: string;
  readonly supportedLanguages: readonly string[];
  readonly categories: readonly ConsentTemplateCategory[];
  readonly validFrom: Date | null;
  readonly validUntil: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  /** Optimistic-concurrency counter; bumped on every status transition. */
  readonly revision: number;
}

export interface ConsentTemplateOutcome {
  readonly template: ConsentTemplate;
  readonly event: PendingAuditEvent;
}

function assertNonEmpty(value: string, field: string, max: number, code: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new InvariantViolation(`A consent template must have a ${field}.`, code);
  }
  if (trimmed.length > max) {
    throw new InvariantViolation(
      `A consent template ${field} must be ${max} characters or fewer, received ${trimmed.length}.`,
      `${code}_TOO_LONG`,
    );
  }
  return trimmed;
}

function assertOptional(
  value: string | null | undefined,
  max: number,
  code: string,
): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > max) {
    throw new InvariantViolation(
      `Field exceeds the maximum of ${max} characters, received ${trimmed.length}.`,
      `${code}_TOO_LONG`,
    );
  }
  return trimmed;
}

function assertLanguages(languages: readonly string[] | undefined): readonly string[] {
  if (languages === undefined || languages.length === 0) {
    throw new InvariantViolation(
      'A consent template must declare at least one supported language.',
      'SUPPORTED_LANGUAGES_REQUIRED',
    );
  }
  if (languages.length > LANGUAGES_MAX_COUNT) {
    throw new InvariantViolation(
      `A consent template may list at most ${LANGUAGES_MAX_COUNT} supported languages, received ${languages.length}.`,
      'TOO_MANY_LANGUAGES',
    );
  }
  const trimmed = languages.map((l) => l.trim()).filter((l) => l.length > 0);
  for (const language of trimmed) {
    if (language.length > LANGUAGE_MAX) {
      throw new InvariantViolation(
        `A supported language code must be ${LANGUAGE_MAX} characters or fewer, received '${language}'.`,
        'LANGUAGE_TOO_LONG',
      );
    }
  }
  return Object.freeze([...new Set(trimmed)]);
}

/**
 * `participation` must always be declared, and always as `required` — a
 * template that does not gate participation itself is not answering the
 * one question every other category decision depends on
 * (`ConsentPolicyService.mayParticipate`).
 */
function assertCategories(
  categories: readonly ConsentTemplateCategory[] | undefined,
): readonly ConsentTemplateCategory[] {
  if (categories === undefined || categories.length === 0) {
    throw new InvariantViolation(
      'A consent template must declare at least one category.',
      'CATEGORIES_REQUIRED',
    );
  }
  if (categories.length > CATEGORIES_MAX_COUNT) {
    throw new InvariantViolation(
      `A consent template may declare at most ${CATEGORIES_MAX_COUNT} categories, received ${categories.length}.`,
      'TOO_MANY_CATEGORIES',
    );
  }

  const seen = new Set<string>();
  const normalised: ConsentTemplateCategory[] = [];

  for (const entry of categories) {
    const category = entry.category.trim();
    if (category.length === 0) {
      throw new InvariantViolation('A consent category name cannot be empty.', 'CATEGORY_REQUIRED');
    }
    if (category.length > CATEGORY_MAX) {
      throw new InvariantViolation(
        `A consent category name must be ${CATEGORY_MAX} characters or fewer, received '${category}'.`,
        'CATEGORY_TOO_LONG',
      );
    }
    if (seen.has(category)) {
      throw new InvariantViolation(
        `Consent category '${category}' is declared more than once.`,
        'DUPLICATE_CATEGORY',
      );
    }
    seen.add(category);
    normalised.push({ category, required: entry.required });
  }

  const participation = normalised.find(
    (c) => c.category === ('participation' satisfies ConsentCategory),
  );
  if (participation === undefined) {
    throw new InvariantViolation(
      "A consent template must declare the 'participation' category.",
      'PARTICIPATION_CATEGORY_REQUIRED',
    );
  }
  if (!participation.required) {
    throw new InvariantViolation(
      "The 'participation' category must be required, not optional.",
      'PARTICIPATION_MUST_BE_REQUIRED',
    );
  }

  return Object.freeze(normalised);
}

function assertValidityPeriod(validFrom: Date | null, validUntil: Date | null): void {
  if (validFrom !== null && Number.isNaN(validFrom.getTime())) {
    throw new InvariantViolation(
      'A consent template validFrom is not a valid date.',
      'INVALID_VALID_FROM',
    );
  }
  if (validUntil !== null && Number.isNaN(validUntil.getTime())) {
    throw new InvariantViolation(
      'A consent template validUntil is not a valid date.',
      'INVALID_VALID_UNTIL',
    );
  }
  if (validFrom !== null && validUntil !== null && validUntil.getTime() <= validFrom.getTime()) {
    throw new InvariantViolation(
      'A consent template validUntil must be after its validFrom.',
      'VALID_UNTIL_BEFORE_VALID_FROM',
    );
  }
}

export interface CreateConsentTemplateInput {
  id: ConsentTemplateId;
  familyId: string;
  organisationId: OrganisationId;
  workspaceId?: WorkspaceId | null | undefined;
  name: string;
  purpose: string;
  description?: string | null | undefined;
  plainLanguageSummary: string;
  supportedLanguages: readonly string[];
  categories: readonly ConsentTemplateCategory[];
  validFrom?: Date | null | undefined;
  validUntil?: Date | null | undefined;
  createdBy: Actor;
  at: Date;
}

/** Create the first version (version 1) of a new template family. Always starts `draft`. */
export function createConsentTemplate(input: CreateConsentTemplateInput): ConsentTemplateOutcome {
  assertValidityPeriod(input.validFrom ?? null, input.validUntil ?? null);

  const template: ConsentTemplate = {
    id: input.id,
    familyId: input.familyId,
    organisationId: input.organisationId,
    workspaceId: input.workspaceId ?? null,
    name: assertNonEmpty(input.name, 'name', NAME_MAX, 'NAME_REQUIRED'),
    purpose: assertNonEmpty(input.purpose, 'purpose', PURPOSE_MAX, 'PURPOSE_REQUIRED'),
    description: assertOptional(input.description, DESCRIPTION_MAX, 'DESCRIPTION'),
    version: 1,
    status: 'draft',
    plainLanguageSummary: assertNonEmpty(
      input.plainLanguageSummary,
      'plain-language summary',
      PLAIN_LANGUAGE_SUMMARY_MAX,
      'PLAIN_LANGUAGE_SUMMARY_REQUIRED',
    ),
    supportedLanguages: assertLanguages(input.supportedLanguages),
    categories: assertCategories(input.categories),
    validFrom: input.validFrom ?? null,
    validUntil: input.validUntil ?? null,
    createdAt: input.at,
    updatedAt: input.at,
    revision: 1,
  };

  return {
    template,
    event: {
      action: 'consent_template.created',
      actor: input.createdBy,
      metadata: {
        familyId: template.familyId,
        organisationId: template.organisationId,
        name: template.name,
        version: String(template.version),
      },
    },
  };
}

export interface CreateNewTemplateVersionInput {
  id: ConsentTemplateId;
  previous: ConsentTemplate;
  name?: string | undefined;
  purpose?: string | undefined;
  description?: string | null | undefined;
  plainLanguageSummary?: string | undefined;
  supportedLanguages?: readonly string[] | undefined;
  categories?: readonly ConsentTemplateCategory[] | undefined;
  validFrom?: Date | null | undefined;
  validUntil?: Date | null | undefined;
  createdBy: Actor;
  at: Date;
}

/**
 * Create the next version in an existing template family. The previous
 * version row is never touched — this returns a brand new `draft` row with
 * `version` incremented, seeded from the previous version's content except
 * where the caller supplies a replacement field.
 */
export function createNewTemplateVersion(
  input: CreateNewTemplateVersionInput,
): ConsentTemplateOutcome {
  const validFrom = input.validFrom !== undefined ? input.validFrom : input.previous.validFrom;
  const validUntil = input.validUntil !== undefined ? input.validUntil : input.previous.validUntil;
  assertValidityPeriod(validFrom, validUntil);

  const template: ConsentTemplate = {
    id: input.id,
    familyId: input.previous.familyId,
    organisationId: input.previous.organisationId,
    workspaceId: input.previous.workspaceId,
    name: assertNonEmpty(input.name ?? input.previous.name, 'name', NAME_MAX, 'NAME_REQUIRED'),
    purpose: assertNonEmpty(
      input.purpose ?? input.previous.purpose,
      'purpose',
      PURPOSE_MAX,
      'PURPOSE_REQUIRED',
    ),
    description:
      input.description !== undefined
        ? assertOptional(input.description, DESCRIPTION_MAX, 'DESCRIPTION')
        : input.previous.description,
    version: input.previous.version + 1,
    status: 'draft',
    plainLanguageSummary: assertNonEmpty(
      input.plainLanguageSummary ?? input.previous.plainLanguageSummary,
      'plain-language summary',
      PLAIN_LANGUAGE_SUMMARY_MAX,
      'PLAIN_LANGUAGE_SUMMARY_REQUIRED',
    ),
    supportedLanguages: assertLanguages(
      input.supportedLanguages ?? input.previous.supportedLanguages,
    ),
    categories: assertCategories(input.categories ?? input.previous.categories),
    validFrom,
    validUntil,
    createdAt: input.at,
    updatedAt: input.at,
    revision: 1,
  };

  return {
    template,
    event: {
      action: 'consent_template.version_created',
      actor: input.createdBy,
      metadata: {
        familyId: template.familyId,
        previousVersion: String(input.previous.version),
        version: String(template.version),
      },
    },
  };
}

/** Activate a draft template version, making it attachable to a session. */
export function activateConsentTemplate(
  template: ConsentTemplate,
  actor: Actor,
  at: Date,
): ConsentTemplateOutcome {
  if (template.status !== 'draft') {
    throw new InvariantViolation(
      `Cannot activate a consent template from status '${template.status}'.`,
      'INVALID_TEMPLATE_TRANSITION',
    );
  }

  const next: ConsentTemplate = {
    ...template,
    status: 'active',
    updatedAt: at,
    revision: template.revision + 1,
  };

  return {
    template: next,
    event: {
      action: 'consent_template.activated',
      actor,
      metadata: { familyId: template.familyId, version: String(template.version) },
    },
  };
}

/** Retire an active template version. Retired versions may not be attached to new sessions. */
export function retireConsentTemplate(
  template: ConsentTemplate,
  actor: Actor,
  at: Date,
): ConsentTemplateOutcome {
  if (template.status !== 'active') {
    throw new InvariantViolation(
      `Cannot retire a consent template from status '${template.status}'.`,
      'INVALID_TEMPLATE_TRANSITION',
    );
  }

  const next: ConsentTemplate = {
    ...template,
    status: 'retired',
    updatedAt: at,
    revision: template.revision + 1,
  };

  return {
    template: next,
    event: {
      action: 'consent_template.retired',
      actor,
      metadata: { familyId: template.familyId, version: String(template.version) },
    },
  };
}
