/**
 * The one place a profile's "sensible defaults" (Flight 1's institutional
 * onboarding gate) are defined — currently just a starter consent template,
 * seeded once at organisation creation via the existing
 * `ConsentTemplatesService`, not a second content-authoring system. A
 * facilitator edits or replaces it exactly like any consent template they
 * created by hand; nothing here is special once it exists. `general` has no
 * entry — an unopinionated institution starts with nothing pre-authored,
 * the same as today.
 */

import type { InstitutionalProfile } from '@witness/domain';
import type { CreateConsentTemplateRequest } from '@witness/contracts';

export const PROFILE_STARTER_CONSENT_TEMPLATES: Partial<
  Record<InstitutionalProfile, CreateConsentTemplateRequest>
> = {
  spc: {
    name: 'Regional community consultation consent',
    purpose: 'Consent for a multi-community consultation session.',
    plainLanguageSummary:
      'We may record this session, write down what was said, and use a local ' +
      'AI tool to help summarise it. Nothing leaves this device. You decide ' +
      'what we may use your contribution for.',
    supportedLanguages: ['en'],
    categories: [
      { category: 'audio_recording', required: false },
      { category: 'transcription', required: false },
      { category: 'ai_processing', required: false },
      { category: 'internal_organisational_use', required: false },
    ],
  },
  fta: {
    name: 'Classroom session consent',
    purpose: 'Consent for a training or classroom co-design session.',
    plainLanguageSummary:
      'We may record this session and use a local AI tool to help summarise ' +
      'it for follow-up. Nothing leaves this device.',
    supportedLanguages: ['en'],
    categories: [
      { category: 'audio_recording', required: false },
      { category: 'transcription', required: false },
      { category: 'ai_processing', required: false },
    ],
  },
  moj: {
    name: 'Formal proceeding consent',
    purpose: 'Consent for a formal proceeding with a stricter evidentiary record.',
    plainLanguageSummary:
      'This session is being recorded and transcribed to keep an accurate ' +
      'record. Access to what is recorded is restricted to the people ' +
      'authorised to review this matter.',
    supportedLanguages: ['en'],
    categories: [
      { category: 'audio_recording', required: true },
      { category: 'transcription', required: true },
      { category: 'internal_organisational_use', required: false },
    ],
  },
  church: {
    name: 'Congregational meeting consent',
    purpose: 'Consent for a church or congregational meeting.',
    plainLanguageSummary:
      'We may record this meeting, write down what was discussed and ' +
      'decided, and use a local AI tool to help summarise it for those who ' +
      'could not attend. Nothing leaves this device.',
    supportedLanguages: ['en'],
    categories: [
      { category: 'audio_recording', required: false },
      { category: 'transcription', required: false },
      { category: 'ai_processing', required: false },
      { category: 'internal_organisational_use', required: false },
    ],
  },
};
