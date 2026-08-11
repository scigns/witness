/**
 * What a report is allowed to say (BUILD_ROADMAP.md Milestone 8).
 *
 * This is the redaction rule, and it is pure. The service resolves the
 * consent answers and the participant's identity mode from the database and
 * hands them in; this module decides what survives into the report and in
 * what form. Keeping the decision here rather than in the rendering code is
 * the whole point: HTML, Markdown, JSON and CSV all go through the same
 * function, so an export cannot disagree with the screen about what a
 * participant agreed to.
 *
 * Three separate questions are answered, in order, and conflating them is the
 * mistake this module exists to prevent:
 *
 * 1. **May this appear at all?** Withdrawn consent, or consent that does not
 *    cover this report's audience, removes the record entirely.
 * 2. **May it be quoted?** Consent to participate is not consent to be
 *    quoted. Evidence that may appear but may not be quoted appears as a
 *    described finding, with its content withheld — `quotable: false` and no
 *    `content` field at all, rather than an empty string, so a template
 *    cannot render a redaction as though it were silence.
 * 3. **Whose voice is it?** An anonymous participant is never named, a
 *    pseudonymous one is named only by their chosen name, and the
 *    facilitator's own synthesis is labelled as synthesis wherever it
 *    appears. Attribution is a *label* here, never an identity — the
 *    projection has no field that could carry a real name for a participant
 *    who did not agree to be named.
 */

import type { EvidenceAttributionMode } from './evidence.js';

/** How a piece of evidence may be attributed in a report, after redaction. */
export const REPORT_ATTRIBUTION_LABELS = [
  'named_participant',
  'pseudonymous_participant',
  'anonymous_participant',
  'facilitator_observation',
  'institutional_source',
  'unattributed',
] as const;
export type ReportAttributionLabel = (typeof REPORT_ATTRIBUTION_LABELS)[number];

/** The audience a report is written for; decides which consent category applies. */
export type ReportAudienceForComposition = 'internal' | 'external' | 'public';

/**
 * The consent answers this decision needs, already resolved by the service.
 * `null` means the evidence has no participant source, so no participant
 * consent is implicated — a facilitator's own observation, for instance.
 */
export interface SourceConsentAnswers {
  /** The participant has withdrawn from the session entirely. */
  readonly withdrawn: boolean;
  /** Consent covering this report's audience (`internal`/`external`/`public`). */
  readonly mayUseForAudience: boolean;
  /** Consent to be quoted by name. */
  readonly mayQuoteAttributed: boolean;
  /** Consent to be quoted without identifying detail. */
  readonly mayQuoteAnonymously: boolean;
}

/** The evidence facts the rule needs. Never the participant's name. */
export interface EvidenceForReport {
  readonly id: string;
  readonly title: string;
  readonly content: string;
  readonly evidenceType: string;
  readonly attributionMode: EvidenceAttributionMode;
  readonly hasParticipantSource: boolean;
  /** The participant's chosen name, for pseudonymous evidence only. */
  readonly pseudonym: string | null;
}

/**
 * Evidence as it may appear in a report.
 *
 * `content` is *structurally absent* when the evidence may not be quoted —
 * the same "absent, not null" convention `EvidenceDetail` uses for restricted
 * fields. A reader of the type cannot forget to check `quotable`, because
 * there is nothing to read if they do.
 */
export interface ReportedEvidence {
  readonly id: string;
  readonly title: string;
  readonly evidenceType: string;
  readonly attribution: ReportAttributionLabel;
  readonly quotable: boolean;
  readonly content?: string;
  /** Present only for `pseudonymous_participant`. */
  readonly pseudonym?: string;
}

/**
 * The consent category a report's audience implicates. Named here rather than
 * inlined at the call site so the mapping is stated once and can be read.
 */
export function consentCategoryForAudience(
  audience: ReportAudienceForComposition,
): 'internal_use' | 'external_reporting' | 'publication' {
  switch (audience) {
    case 'internal':
      return 'internal_use';
    case 'external':
      return 'external_reporting';
    case 'public':
      return 'publication';
  }
}

/**
 * How evidence may be attributed once redacted.
 *
 * `attributed` becomes `named_participant` only when the participant agreed
 * to attributed quotation. Without that agreement it falls back to
 * `anonymous_participant` rather than being dropped — the finding still
 * happened, and losing it entirely would distort the record in the other
 * direction.
 */
function attributionFor(
  evidence: EvidenceForReport,
  consent: SourceConsentAnswers | null,
): ReportAttributionLabel {
  switch (evidence.attributionMode) {
    case 'attributed':
      return consent !== null && consent.mayQuoteAttributed
        ? 'named_participant'
        : 'anonymous_participant';
    case 'pseudonymous':
      return 'pseudonymous_participant';
    case 'anonymous':
      return 'anonymous_participant';
    case 'facilitator_observation':
      return 'facilitator_observation';
    case 'institutional_source':
      return 'institutional_source';
    case 'unattributed':
      return 'unattributed';
  }
}

/**
 * Project one piece of evidence into a report, or refuse it.
 *
 * Returns `null` when the evidence must not appear at all. The caller must
 * treat that as "this finding is not in the report", not as "render an empty
 * entry" — an empty entry tells a reader something was removed, which for a
 * participant who withdrew is itself a disclosure.
 *
 * `consent` is `null` for evidence with no participant source. Such evidence
 * carries no participant's agreement to respect, and is quotable.
 *
 * The report's audience is not a parameter: it has already been folded into
 * `mayUseForAudience` by the caller, via `consentCategoryForAudience`. Taking
 * it again would invite two answers to the same question that could disagree.
 */
export function projectEvidenceForReport(
  evidence: EvidenceForReport,
  consent: SourceConsentAnswers | null,
): ReportedEvidence | null {
  if (evidence.hasParticipantSource && consent === null) {
    // A participant-sourced record whose consent could not be resolved fails
    // closed. An unanswered consent question is not a yes.
    return null;
  }

  if (consent !== null) {
    if (consent.withdrawn) return null;
    if (!consent.mayUseForAudience) return null;
  }

  const attribution = attributionFor(evidence, consent);

  // Quoting is a separate permission from appearing. Evidence with no
  // participant behind it is quotable; evidence with one needs the agreement
  // that matches how it will be attributed.
  const quotable =
    consent === null
      ? true
      : attribution === 'named_participant'
        ? consent.mayQuoteAttributed
        : consent.mayQuoteAnonymously;

  const base = {
    id: evidence.id,
    title: evidence.title,
    evidenceType: evidence.evidenceType,
    attribution,
    quotable,
  };

  return {
    ...base,
    ...(quotable ? { content: evidence.content } : {}),
    ...(attribution === 'pseudonymous_participant' && evidence.pseudonym !== null
      ? { pseudonym: evidence.pseudonym }
      : {}),
  };
}

/**
 * A confirmed transcript, as text, ready to be redacted the same way its
 * evidence would be. Not a `Transcript` (packages/domain/src/transcript.ts)
 * directly — this module never imports the domain models it redacts, only
 * the flattened facts it needs (same convention `EvidenceForReport` sets).
 */
export interface TranscriptForReport {
  readonly evidenceId: string;
  readonly evidenceTitle: string;
  readonly text: string;
}

export interface ReportedTranscript {
  readonly evidenceId: string;
  readonly evidenceTitle: string;
  readonly attribution: ReportAttributionLabel;
  readonly quotable: boolean;
  readonly content?: string;
  readonly pseudonym?: string;
}

/**
 * Project a transcript into a report, or refuse it.
 *
 * A transcript is speech-to-text of a specific piece of evidence's audio —
 * it carries exactly the same participant-consent exposure as that
 * evidence's own `content`, arguably more so, being closer to verbatim
 * speech. Rather than re-deriving that judgement, this reuses
 * `projectEvidenceForReport`'s answer for the evidence the transcript
 * belongs to and substitutes the transcript's own text for `content` — one
 * redaction rule, applied to two different renderings of the same consent
 * boundary, exactly the reasoning this module's file header states for why
 * the rule lives here rather than once per renderer.
 */
export function projectTranscriptForReport(
  evidence: EvidenceForReport,
  transcript: TranscriptForReport,
  consent: SourceConsentAnswers | null,
): ReportedTranscript | null {
  const projected = projectEvidenceForReport(evidence, consent);
  if (projected === null) return null;

  return {
    evidenceId: transcript.evidenceId,
    evidenceTitle: transcript.evidenceTitle,
    attribution: projected.attribution,
    quotable: projected.quotable,
    ...(projected.quotable ? { content: transcript.text } : {}),
    ...(projected.pseudonym !== undefined ? { pseudonym: projected.pseudonym } : {}),
  };
}

/** How many participants took part, and under what identity arrangements. */
export interface ParticipantIdentityCounts {
  readonly named: number;
  readonly pseudonymous: number;
  readonly anonymous: number;
}

/**
 * A privacy-safe account of who took part.
 *
 * Counts and nothing else. A report that listed participants would defeat
 * anonymity by enumeration — in a session of six, "five named participants
 * and one anonymous" plus a list of five names identifies the sixth. Only
 * `named` is broken out by name elsewhere in the product, and only where a
 * participant chose that; here not even the named ones are listed, because a
 * report is the artefact most likely to travel.
 */
export interface ReportedParticipantSummary {
  readonly total: number;
  readonly counts: ParticipantIdentityCounts;
  /** Participants who withdrew are counted, not named, and not silently dropped. */
  readonly withdrawn: number;
  readonly attendedInPerson: number;
  readonly attendedOnline: number;
}

export interface ParticipantForReport {
  readonly identityMode: 'named' | 'pseudonymous' | 'anonymous';
  readonly participationMode: string;
  readonly withdrawn: boolean;
  readonly attended: boolean;
}

/**
 * Summarise participation without identifying anyone.
 *
 * Withdrawn participants are counted separately rather than removed from the
 * total: a reader comparing two revisions of a report would otherwise see the
 * count drop by one and know exactly who left.
 */
export function summariseParticipants(
  participants: readonly ParticipantForReport[],
): ReportedParticipantSummary {
  const counts: ParticipantIdentityCounts = {
    named: participants.filter((p) => p.identityMode === 'named').length,
    pseudonymous: participants.filter((p) => p.identityMode === 'pseudonymous').length,
    anonymous: participants.filter((p) => p.identityMode === 'anonymous').length,
  };

  return {
    total: participants.length,
    counts,
    withdrawn: participants.filter((p) => p.withdrawn).length,
    attendedInPerson: participants.filter((p) => p.attended && p.participationMode === 'in_person')
      .length,
    attendedOnline: participants.filter((p) => p.attended && p.participationMode === 'online')
      .length,
  };
}

/**
 * Whether a report's narrative section is the facilitator's own voice.
 *
 * Trivial as a function, deliberate as a boundary: every renderer asks this
 * rather than deciding for itself, so no template can present synthesis under
 * a heading that implies participants said it. The sections named here are
 * institutional interpretation; everything else in a report traces to a
 * source record.
 */
export const FACILITATOR_VOICE_SECTIONS = [
  'facilitatorSynthesis',
  'unresolvedQuestions',
  'recommendations',
] as const;
export type FacilitatorVoiceSection = (typeof FACILITATOR_VOICE_SECTIONS)[number];

export function isFacilitatorVoice(section: string): section is FacilitatorVoiceSection {
  return (FACILITATOR_VOICE_SECTIONS as readonly string[]).includes(section);
}
