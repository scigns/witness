import { describe, expect, it } from 'vitest';

import { toActorId, toConsentTemplateId, toOrganisationId, toWorkspaceId } from './ids.js';
import type { Actor } from './actor.js';
import { InvariantViolation } from './errors.js';
import {
  activateConsentTemplate,
  createConsentTemplate,
  createNewTemplateVersion,
  retireConsentTemplate,
  type ConsentTemplate,
  type ConsentTemplateCategory,
} from './consent-template.js';

const HUMAN: Actor = {
  id: toActorId('11111111-1111-4111-8111-111111111111'),
  kind: 'human',
  displayName: 'Administrator',
};
const NOW = new Date('2026-04-01T10:00:00Z');
const LATER = new Date('2026-04-01T11:00:00Z');

const ORG = toOrganisationId('22222222-2222-4222-8222-222222222222');
const WORKSPACE = toWorkspaceId('33333333-3333-4333-8333-333333333333');

function categories(...extra: ConsentTemplateCategory[]): ConsentTemplateCategory[] {
  return [{ category: 'participation', required: true }, ...extra];
}

function baseInput() {
  return {
    id: toConsentTemplateId('44444444-4444-4444-8444-444444444444'),
    familyId: 'family-1',
    organisationId: ORG,
    name: 'Community Consultation Consent',
    purpose: 'Consent to participate in a community consultation workshop.',
    plainLanguageSummary: 'We will ask what you think and may record it.',
    supportedLanguages: ['en'],
    categories: categories({ category: 'audio_recording', required: false }),
    createdBy: HUMAN,
    at: NOW,
  };
}

function draftTemplate(): ConsentTemplate {
  return createConsentTemplate(baseInput()).template;
}

function activeTemplate(): ConsentTemplate {
  return activateConsentTemplate(draftTemplate(), HUMAN, LATER).template;
}

describe('createConsentTemplate', () => {
  it('creates version 1 as a draft', () => {
    const { template, event } = createConsentTemplate(baseInput());
    expect(template.version).toBe(1);
    expect(template.status).toBe('draft');
    expect(template.familyId).toBe('family-1');
    expect(event.action).toBe('consent_template.created');
  });

  it('rejects a template with no participation category', () => {
    expect(() =>
      createConsentTemplate({
        ...baseInput(),
        categories: [{ category: 'audio_recording', required: false }],
      }),
    ).toThrow(/participation/i);
  });

  it('rejects a template where participation is optional', () => {
    expect(() =>
      createConsentTemplate({
        ...baseInput(),
        categories: [{ category: 'participation', required: false }],
      }),
    ).toThrow(/must be required/i);
  });

  it('rejects a duplicate category', () => {
    expect(() =>
      createConsentTemplate({
        ...baseInput(),
        categories: categories(
          { category: 'audio_recording', required: false },
          { category: 'audio_recording', required: true },
        ),
      }),
    ).toThrow(/more than once/i);
  });

  it('rejects an empty supported-languages list', () => {
    expect(() => createConsentTemplate({ ...baseInput(), supportedLanguages: [] })).toThrow(
      InvariantViolation,
    );
  });

  it('rejects an invalid validity period', () => {
    expect(() =>
      createConsentTemplate({
        ...baseInput(),
        validFrom: new Date('2026-06-01T00:00:00Z'),
        validUntil: new Date('2026-05-01T00:00:00Z'),
      }),
    ).toThrow(/after its validFrom/i);
  });

  it('supports an optional workspaceId for a workspace-specific template', () => {
    const { template } = createConsentTemplate({ ...baseInput(), workspaceId: WORKSPACE });
    expect(template.workspaceId).toBe(WORKSPACE);
  });

  it('defaults workspaceId to null for an organisation-wide template', () => {
    const { template } = createConsentTemplate(baseInput());
    expect(template.workspaceId).toBeNull();
  });
});

describe('createNewTemplateVersion', () => {
  it('creates version 2 sharing the same familyId, as a new draft', () => {
    const v1 = draftTemplate();
    const { template, event } = createNewTemplateVersion({
      id: toConsentTemplateId('55555555-5555-4555-8555-555555555555'),
      previous: v1,
      createdBy: HUMAN,
      at: LATER,
    });
    expect(template.familyId).toBe(v1.familyId);
    expect(template.version).toBe(2);
    expect(template.status).toBe('draft');
    expect(event.action).toBe('consent_template.version_created');
  });

  it('does not mutate the previous version', () => {
    const v1 = draftTemplate();
    const before = { ...v1 };
    createNewTemplateVersion({
      id: toConsentTemplateId('55555555-5555-4555-8555-555555555555'),
      previous: v1,
      name: 'Renamed',
      createdBy: HUMAN,
      at: LATER,
    });
    expect(v1).toEqual(before);
  });

  it('inherits fields not overridden by the caller', () => {
    const v1 = draftTemplate();
    const { template } = createNewTemplateVersion({
      id: toConsentTemplateId('55555555-5555-4555-8555-555555555555'),
      previous: v1,
      createdBy: HUMAN,
      at: LATER,
    });
    expect(template.name).toBe(v1.name);
    expect(template.categories).toEqual(v1.categories);
  });

  it('overrides fields the caller supplies', () => {
    const v1 = draftTemplate();
    const { template } = createNewTemplateVersion({
      id: toConsentTemplateId('55555555-5555-4555-8555-555555555555'),
      previous: v1,
      name: 'Updated Consent Terms',
      createdBy: HUMAN,
      at: LATER,
    });
    expect(template.name).toBe('Updated Consent Terms');
  });

  it('ATTACK — a new version still requires the participation category', () => {
    const v1 = draftTemplate();
    expect(() =>
      createNewTemplateVersion({
        id: toConsentTemplateId('55555555-5555-4555-8555-555555555555'),
        previous: v1,
        categories: [{ category: 'audio_recording', required: false }],
        createdBy: HUMAN,
        at: LATER,
      }),
    ).toThrow(/participation/i);
  });
});

describe('activateConsentTemplate / retireConsentTemplate', () => {
  it('activates a draft template', () => {
    const { template, event } = activateConsentTemplate(draftTemplate(), HUMAN, LATER);
    expect(template.status).toBe('active');
    expect(event.action).toBe('consent_template.activated');
  });

  it('ATTACK — rejects activating an already-active template', () => {
    const active = activeTemplate();
    expect(() => activateConsentTemplate(active, HUMAN, LATER)).toThrow(/cannot activate/i);
  });

  it('retires an active template', () => {
    const active = activeTemplate();
    const { template, event } = retireConsentTemplate(active, HUMAN, LATER);
    expect(template.status).toBe('retired');
    expect(event.action).toBe('consent_template.retired');
  });

  it('ATTACK — rejects retiring a draft template', () => {
    expect(() => retireConsentTemplate(draftTemplate(), HUMAN, LATER)).toThrow(/cannot retire/i);
  });

  it('ATTACK — rejects retiring an already-retired template', () => {
    const retired = retireConsentTemplate(activeTemplate(), HUMAN, LATER).template;
    expect(() => retireConsentTemplate(retired, HUMAN, LATER)).toThrow(/cannot retire/i);
  });
});
