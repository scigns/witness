/**
 * SessionConsentConfiguration (BUILD_ROADMAP.md Milestone 4, Consent
 * Management) — which `ConsentTemplate` version a session uses, and which
 * of that template's categories are required or optional for this specific
 * session.
 *
 * A session has at most one configuration at a time: configuring consent
 * again while one already exists updates it in place (with optimistic
 * concurrency), rather than versioning the configuration itself — only the
 * template content is versioned (`consent-template.ts`); the session-level
 * attachment is a plain, reconfigurable pointer to a specific immutable
 * template version, same relationship `CoDesignSession.primaryFacilitatorId`
 * has to `User`.
 *
 * `requiredCategories`/`optionalCategories` are drawn from the attached
 * template's own `categories` list, letting one session narrow which of a
 * broader template's categories actually apply here (e.g. a template
 * defines `photography` as optional, but a specific session has no
 * photographer and never asks about it at all) — never widen it: a session
 * cannot require or offer a category the template does not declare, and
 * cannot ask a category the template marks optional as though it were
 * required by simply relabelling it.
 */

import { InvariantViolation } from './errors.js';
import type { Actor } from './actor.js';
import type { PendingAuditEvent } from './audit.js';
import type { ConsentTemplate } from './consent-template.js';
import type {
  ConsentTemplateId,
  OrganisationId,
  SessionConsentConfigurationId,
  CoDesignSessionId,
  WorkspaceId,
} from './ids.js';
import type { SessionStatus } from './co-design-session.js';

const FACILITATOR_INSTRUCTIONS_MAX = 5000;
const PARTICIPANT_INTRODUCTION_MAX = 5000;

export const SESSION_CONSENT_CONFIGURATION_STATUSES = ['draft', 'active', 'retired'] as const;
export type SessionConsentConfigurationStatus =
  (typeof SESSION_CONSENT_CONFIGURATION_STATUSES)[number];

export interface SessionConsentConfiguration {
  readonly id: SessionConsentConfigurationId;
  readonly organisationId: OrganisationId;
  readonly workspaceId: WorkspaceId;
  readonly sessionId: CoDesignSessionId;
  readonly consentTemplateId: ConsentTemplateId;
  readonly templateVersion: number;
  readonly requiredCategories: readonly string[];
  readonly optionalCategories: readonly string[];
  readonly facilitatorInstructions: string | null;
  readonly participantIntroduction: string | null;
  readonly effectiveDate: Date;
  readonly status: SessionConsentConfigurationStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  /** Optimistic-concurrency counter; bumped on every mutation. */
  readonly version: number;
}

export interface SessionConsentConfigurationOutcome {
  readonly configuration: SessionConsentConfiguration;
  readonly event: PendingAuditEvent;
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

/**
 * `requiredCategories`/`optionalCategories` must partition a subset of the
 * template's own declared categories: no category outside the template,
 * none repeated between required and optional, and `participation` must be
 * required (mirrors `consent-template.ts`'s own rule, checked again here
 * because a session is free to narrow the template's categories and could
 * otherwise narrow `participation` itself right out of the required list).
 */
function assertCategorySelection(
  template: ConsentTemplate,
  requiredCategories: readonly string[],
  optionalCategories: readonly string[],
): { required: readonly string[]; optional: readonly string[] } {
  const templateCategories = new Set(template.categories.map((c) => c.category));
  const required = [
    ...new Set(requiredCategories.map((c) => c.trim()).filter((c) => c.length > 0)),
  ];
  const optional = [
    ...new Set(optionalCategories.map((c) => c.trim()).filter((c) => c.length > 0)),
  ];

  if (required.length === 0) {
    throw new InvariantViolation(
      'A session consent configuration must require at least one category.',
      'REQUIRED_CATEGORIES_REQUIRED',
    );
  }

  for (const category of [...required, ...optional]) {
    if (!templateCategories.has(category)) {
      throw new InvariantViolation(
        `Category '${category}' is not declared by the attached consent template.`,
        'CATEGORY_NOT_IN_TEMPLATE',
      );
    }
  }

  const overlap = required.filter((c) => optional.includes(c));
  if (overlap.length > 0) {
    throw new InvariantViolation(
      `Category '${overlap[0]}' cannot be both required and optional.`,
      'CATEGORY_REQUIRED_AND_OPTIONAL',
    );
  }

  if (!required.includes('participation')) {
    throw new InvariantViolation(
      "The 'participation' category must be required for this session.",
      'PARTICIPATION_MUST_BE_REQUIRED',
    );
  }

  return { required: Object.freeze(required), optional: Object.freeze(optional) };
}

/**
 * Session states that permit configuring or reconfiguring consent —
 * `draft` and `scheduled` only, per the milestone's explicit rule. `open`
 * is deliberately excluded: once a session is live, changing what consent
 * is being asked for would invalidate decisions participants have already
 * made against the previous configuration.
 */
function assertConfigurable(sessionStatus: SessionStatus): void {
  if (sessionStatus !== 'draft' && sessionStatus !== 'scheduled') {
    throw new InvariantViolation(
      `Cannot configure session consent while the session is '${sessionStatus}'.`,
      'SESSION_NOT_CONFIGURABLE',
    );
  }
}

export interface ConfigureSessionConsentInput {
  id: SessionConsentConfigurationId;
  organisationId: OrganisationId;
  workspaceId: WorkspaceId;
  sessionId: CoDesignSessionId;
  template: ConsentTemplate;
  requiredCategories: readonly string[];
  optionalCategories?: readonly string[] | undefined;
  facilitatorInstructions?: string | null | undefined;
  participantIntroduction?: string | null | undefined;
  effectiveDate?: Date | undefined;
  configuredBy: Actor;
  at: Date;
}

/**
 * Attach a template to a session for the first time. The template must be
 * `active` — a `draft` or `retired` version cannot be attached, the same
 * "only a live version governs real decisions" reasoning
 * `consent-template.ts`'s lifecycle exists to guarantee.
 */
export function configureSessionConsent(
  sessionStatus: SessionStatus,
  input: ConfigureSessionConsentInput,
): SessionConsentConfigurationOutcome {
  assertConfigurable(sessionStatus);

  if (input.template.status !== 'active') {
    throw new InvariantViolation(
      `Cannot attach a consent template with status '${input.template.status}' — only an active template version may govern a session.`,
      'TEMPLATE_NOT_ACTIVE',
    );
  }

  const { required, optional } = assertCategorySelection(
    input.template,
    input.requiredCategories,
    input.optionalCategories ?? [],
  );

  const configuration: SessionConsentConfiguration = {
    id: input.id,
    organisationId: input.organisationId,
    workspaceId: input.workspaceId,
    sessionId: input.sessionId,
    consentTemplateId: input.template.id,
    templateVersion: input.template.version,
    requiredCategories: required,
    optionalCategories: optional,
    facilitatorInstructions: assertOptional(
      input.facilitatorInstructions,
      FACILITATOR_INSTRUCTIONS_MAX,
      'FACILITATOR_INSTRUCTIONS',
    ),
    participantIntroduction: assertOptional(
      input.participantIntroduction,
      PARTICIPANT_INTRODUCTION_MAX,
      'PARTICIPANT_INTRODUCTION',
    ),
    effectiveDate: input.effectiveDate ?? input.at,
    status: 'active',
    createdAt: input.at,
    updatedAt: input.at,
    version: 1,
  };

  return {
    configuration,
    event: {
      action: 'session_consent_configuration.created',
      actor: input.configuredBy,
      metadata: {
        sessionId: configuration.sessionId,
        consentTemplateId: configuration.consentTemplateId,
        templateVersion: String(configuration.templateVersion),
      },
    },
  };
}

export interface ReconfigureSessionConsentInput {
  template: ConsentTemplate;
  requiredCategories: readonly string[];
  optionalCategories?: readonly string[] | undefined;
  facilitatorInstructions?: string | null | undefined;
  participantIntroduction?: string | null | undefined;
  reconfiguredBy: Actor;
  at: Date;
}

/**
 * Replace an existing configuration's template attachment and/or category
 * selection. Permitted only while the session is still `draft`/`scheduled`
 * — reconfiguring mid-session is the same hazard as configuring it for the
 * first time once the session is open.
 */
export function reconfigureSessionConsent(
  configuration: SessionConsentConfiguration,
  sessionStatus: SessionStatus,
  input: ReconfigureSessionConsentInput,
): SessionConsentConfigurationOutcome {
  assertConfigurable(sessionStatus);

  if (input.template.status !== 'active') {
    throw new InvariantViolation(
      `Cannot attach a consent template with status '${input.template.status}' — only an active template version may govern a session.`,
      'TEMPLATE_NOT_ACTIVE',
    );
  }

  const { required, optional } = assertCategorySelection(
    input.template,
    input.requiredCategories,
    input.optionalCategories ?? [],
  );

  const next: SessionConsentConfiguration = {
    ...configuration,
    consentTemplateId: input.template.id,
    templateVersion: input.template.version,
    requiredCategories: required,
    optionalCategories: optional,
    facilitatorInstructions: assertOptional(
      input.facilitatorInstructions,
      FACILITATOR_INSTRUCTIONS_MAX,
      'FACILITATOR_INSTRUCTIONS',
    ),
    participantIntroduction: assertOptional(
      input.participantIntroduction,
      PARTICIPANT_INTRODUCTION_MAX,
      'PARTICIPANT_INTRODUCTION',
    ),
    updatedAt: input.at,
    version: configuration.version + 1,
  };

  return {
    configuration: next,
    event: {
      action: 'session_consent_configuration.updated',
      actor: input.reconfiguredBy,
      metadata: {
        sessionId: configuration.sessionId,
        consentTemplateId: next.consentTemplateId,
        templateVersion: String(next.templateVersion),
      },
    },
  };
}
