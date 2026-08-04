import { describe, expect, it } from 'vitest';

import {
  toActorId,
  toCoDesignSessionId,
  toConsentTemplateId,
  toOrganisationId,
  toSessionConsentConfigurationId,
  toWorkspaceId,
} from './ids.js';
import type { Actor } from './actor.js';
import {
  activateConsentTemplate,
  createConsentTemplate,
  type ConsentTemplate,
} from './consent-template.js';
import {
  configureSessionConsent,
  reconfigureSessionConsent,
} from './session-consent-configuration.js';

const HUMAN: Actor = {
  id: toActorId('11111111-1111-4111-8111-111111111111'),
  kind: 'human',
  displayName: 'Facilitator',
};
const NOW = new Date('2026-04-01T10:00:00Z');
const LATER = new Date('2026-04-01T11:00:00Z');

const ORG = toOrganisationId('22222222-2222-4222-8222-222222222222');
const WORKSPACE = toWorkspaceId('33333333-3333-4333-8333-333333333333');
const SESSION = toCoDesignSessionId('44444444-4444-4444-8444-444444444444');

function activeTemplate(): ConsentTemplate {
  const draft = createConsentTemplate({
    id: toConsentTemplateId('55555555-5555-4555-8555-555555555555'),
    familyId: 'family-1',
    organisationId: ORG,
    name: 'Consent Terms',
    purpose: 'Purpose',
    plainLanguageSummary: 'Summary',
    supportedLanguages: ['en'],
    categories: [
      { category: 'participation', required: true },
      { category: 'audio_recording', required: false },
      { category: 'photography', required: false },
    ],
    createdBy: HUMAN,
    at: NOW,
  }).template;
  return activateConsentTemplate(draft, HUMAN, NOW).template;
}

function baseConfigInput() {
  return {
    id: toSessionConsentConfigurationId('66666666-6666-4666-8666-666666666666'),
    organisationId: ORG,
    workspaceId: WORKSPACE,
    sessionId: SESSION,
    template: activeTemplate(),
    requiredCategories: ['participation'],
    optionalCategories: ['audio_recording'],
    configuredBy: HUMAN,
    at: NOW,
  };
}

describe('configureSessionConsent', () => {
  it('attaches an active template to a draft session', () => {
    const { configuration, event } = configureSessionConsent('draft', baseConfigInput());
    expect(configuration.status).toBe('active');
    expect(configuration.templateVersion).toBe(1);
    expect(configuration.requiredCategories).toEqual(['participation']);
    expect(event.action).toBe('session_consent_configuration.created');
  });

  it('permits configuring a scheduled session', () => {
    expect(() => configureSessionConsent('scheduled', baseConfigInput())).not.toThrow();
  });

  it.each(['open', 'closed', 'archived'] as const)(
    'ATTACK — rejects configuring while the session is %s',
    (status) => {
      expect(() => configureSessionConsent(status, baseConfigInput())).toThrow(/cannot configure/i);
    },
  );

  it('ATTACK — rejects attaching a draft (not yet active) template', () => {
    const draft = createConsentTemplate({
      id: toConsentTemplateId('77777777-7777-4777-8777-777777777777'),
      familyId: 'family-2',
      organisationId: ORG,
      name: 'Draft Terms',
      purpose: 'Purpose',
      plainLanguageSummary: 'Summary',
      supportedLanguages: ['en'],
      categories: [{ category: 'participation', required: true }],
      createdBy: HUMAN,
      at: NOW,
    }).template;

    expect(() =>
      configureSessionConsent('draft', { ...baseConfigInput(), template: draft }),
    ).toThrow(/only an active template version/i);
  });

  it('ATTACK — rejects a required category the template does not declare', () => {
    expect(() =>
      configureSessionConsent('draft', {
        ...baseConfigInput(),
        requiredCategories: ['participation', 'video_recording'],
      }),
    ).toThrow(/not declared by the attached consent template/i);
  });

  it('ATTACK — rejects a category listed as both required and optional', () => {
    expect(() =>
      configureSessionConsent('draft', {
        ...baseConfigInput(),
        requiredCategories: ['participation', 'audio_recording'],
        optionalCategories: ['audio_recording'],
      }),
    ).toThrow(/both required and optional/i);
  });

  it('ATTACK — rejects a configuration that does not require participation', () => {
    expect(() =>
      configureSessionConsent('draft', {
        ...baseConfigInput(),
        requiredCategories: ['audio_recording'],
        optionalCategories: ['photography'],
      }),
    ).toThrow(/participation.*must be required/i);
  });
});

describe('reconfigureSessionConsent', () => {
  it('updates the attached template and categories', () => {
    const template = activeTemplate();
    const configuration = configureSessionConsent('draft', {
      ...baseConfigInput(),
      template,
    }).configuration;

    const { configuration: next, event } = reconfigureSessionConsent(configuration, 'draft', {
      template,
      requiredCategories: ['participation'],
      optionalCategories: ['photography'],
      reconfiguredBy: HUMAN,
      at: LATER,
    });

    expect(next.optionalCategories).toEqual(['photography']);
    expect(next.version).toBe(configuration.version + 1);
    expect(event.action).toBe('session_consent_configuration.updated');
  });

  it('ATTACK — rejects reconfiguring an open session', () => {
    const configuration = configureSessionConsent('draft', baseConfigInput()).configuration;
    expect(() =>
      reconfigureSessionConsent(configuration, 'open', {
        template: activeTemplate(),
        requiredCategories: ['participation'],
        reconfiguredBy: HUMAN,
        at: LATER,
      }),
    ).toThrow(/cannot configure/i);
  });
});
