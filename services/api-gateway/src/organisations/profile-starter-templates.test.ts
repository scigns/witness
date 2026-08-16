/**
 * Every starter template must actually pass the real domain validation it
 * will be submitted through — found live on witness-prod-01: all four
 * starter templates omitted `participation`, which `createConsentTemplate`
 * requires, so `ConsentTemplatesService.create()` threw for every profile
 * and organisation creation silently produced zero starter templates (the
 * best-effort catch in `OrganisationsService.create()` swallowed the
 * failure exactly as designed, which is why the organisation itself still
 * looked fine). The existing service-level test only checked that
 * `consentTemplates.create` was *called*, against a fake with no real
 * validation, so it could not have caught this — this file exercises the
 * real domain function instead.
 */

import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import {
  createConsentTemplate,
  toActorId,
  toConsentTemplateId,
  toOrganisationId,
  INSTITUTIONAL_PROFILES,
} from '@witness/domain';

import { PROFILE_STARTER_CONSENT_TEMPLATES } from './profile-starter-templates.js';

const ACTOR = { id: toActorId(randomUUID()), kind: 'system' as const, displayName: 'Test' };
const ORG_ID = toOrganisationId(randomUUID());
const NOW = new Date('2026-08-16T00:00:00Z');

describe('PROFILE_STARTER_CONSENT_TEMPLATES', () => {
  for (const profile of INSTITUTIONAL_PROFILES) {
    const starter = PROFILE_STARTER_CONSENT_TEMPLATES[profile];
    if (starter === undefined) continue;

    it(`'${profile}' starter template passes real domain validation`, () => {
      expect(() =>
        createConsentTemplate({
          id: toConsentTemplateId(randomUUID()),
          familyId: randomUUID(),
          organisationId: ORG_ID,
          name: starter.name,
          purpose: starter.purpose,
          plainLanguageSummary: starter.plainLanguageSummary,
          supportedLanguages: starter.supportedLanguages,
          categories: starter.categories,
          createdBy: ACTOR,
          at: NOW,
        }),
      ).not.toThrow();
    });
  }
});
