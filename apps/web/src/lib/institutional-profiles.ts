/**
 * Client-facing content for `Organisation.profile` (packages/domain/src/organisation.ts's
 * `INSTITUTIONAL_PROFILES`). A profile configures starting defaults only — never a
 * separate code path, never a separate deployment (see `profile-starter-templates.ts`
 * on the API side, which does the same thing for the starter consent template).
 *
 * This file is presentation-only: labels, placeholders and one-line structural
 * guidance paraphrased from `docs/release/CLIENT_ROLLOUT_PROFILES.md`. It carries no
 * legal claim and no institution-specific detail — swapping in a fifth profile means
 * adding one entry here, not forking anything.
 */

export type InstitutionalProfile = 'general' | 'spc' | 'fta' | 'moj' | 'church';

export interface InstitutionalProfileInfo {
  /** Shown in the profile picker. */
  readonly label: string;
  /** One sentence, shown under the picker. */
  readonly description: string;
  /** Placeholder text for a new program's name field under this profile. */
  readonly programNamePlaceholder: string;
  /**
   * A single structural hint shown when creating a program under this profile.
   * `null` for `general`, which starts with no opinion, same as today.
   */
  readonly programGuidance: string | null;
}

export const INSTITUTIONAL_PROFILE_INFO: Record<InstitutionalProfile, InstitutionalProfileInfo> = {
  general: {
    label: 'General — no starting defaults',
    description: 'An unopinionated starting point. Build the program structure from scratch.',
    programNamePlaceholder: 'Program name',
    programGuidance: null,
  },
  spc: {
    label: 'Regional / multi-community consultation (SPC)',
    description: 'For a consultation initiative spanning multiple communities or regions.',
    programNamePlaceholder: 'e.g. "Eastern Region Water Consultation"',
    programGuidance:
      'Typical structure: one program per consultation initiative, with one session per ' +
      'community visit or meeting. Consent is opt-in per category — confirm what each ' +
      'community has agreed to before recording.',
  },
  fta: {
    label: 'Training / classroom co-design (FTA)',
    description: 'For a training course or classroom co-design cohort.',
    programNamePlaceholder: 'e.g. "2026 Facilitator Training Cohort"',
    programGuidance:
      'Typical structure: one program per course or cohort, with one session per class or ' +
      'workshop. Participants are usually named (attendance matters) rather than anonymous.',
  },
  moj: {
    label: 'Formal institutional process (Justice)',
    description: 'For a formal proceeding needing a stronger evidentiary record.',
    programNamePlaceholder: 'e.g. "Matter 2026-014"',
    programGuidance:
      'Typical structure: one program per matter or case, with one session per sitting or ' +
      'hearing. Recording and transcription are required, not optional — confirm the legal ' +
      'basis for that with the institution before the first real matter.',
  },
  church: {
    label: 'Congregational governance (Church)',
    description: "For a congregation or committee's regular meetings.",
    programNamePlaceholder: 'e.g. "Parish Council"',
    programGuidance:
      'Typical structure: one program per congregation or committee, with one session per meeting.',
  },
};

export const INSTITUTIONAL_PROFILE_ORDER: readonly InstitutionalProfile[] = [
  'general',
  'spc',
  'fta',
  'moj',
  'church',
];
