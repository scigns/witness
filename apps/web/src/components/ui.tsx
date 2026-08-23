'use client';

/**
 * Small shared presentation pieces.
 *
 * `packages/ui` is where the real design system lives (Phase 6, roadmap 6.3).
 * These are deliberately minimal and local so that the preview does not create
 * a second component library that the design system would later have to
 * reconcile with.
 */

import Link from 'next/link';
import { useState, type ReactNode } from 'react';

import type {
  ActionItemStatus,
  ReportStatus,
  CommitmentStatus,
  DecisionStatus,
  EvidenceReviewStatus,
  MembershipState,
  ParticipantAttendanceStatus,
  ParticipantInvitationStatus,
  ReviewState,
  RoleAssignmentView,
  RoleDefinition,
  SessionStatus,
  WitnessRole,
} from '@witness/contracts';

const STATE_LABELS: Record<ReviewState, string> = {
  draft: 'Draft',
  in_review: 'In review',
  confirmed: 'Confirmed',
  corrected: 'Corrected',
  rejected: 'Rejected',
};

/**
 * Colour is never the only signal — WCAG 2.2 AA (1.4.1) requires that meaning
 * survives for a user who cannot distinguish the hues, so each state carries a
 * distinct label and an explicit accepted/candidate note.
 */
const STATE_CLASSES: Record<ReviewState, string> = {
  draft: 'border-current text-[var(--color-ink-muted)]',
  in_review: 'border-amber-600 text-amber-700 dark:text-amber-400',
  confirmed: 'border-emerald-700 text-emerald-700 dark:text-emerald-400',
  corrected: 'border-emerald-700 text-emerald-700 dark:text-emerald-400',
  rejected: 'border-red-700 text-red-700 dark:text-red-400',
};

export function StateBadge({ state }: { state: ReviewState }) {
  const accepted = state === 'confirmed' || state === 'corrected';

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${STATE_CLASSES[state]}`}
    >
      {STATE_LABELS[state]}
      <span className="sr-only">
        {accepted ? ' — accepted as institutional record' : ' — candidate, not yet accepted'}
      </span>
    </span>
  );
}

const MEMBERSHIP_STATE_LABELS: Record<MembershipState, string> = {
  invited: 'Invited',
  active: 'Active',
  suspended: 'Suspended',
  revoked: 'Revoked',
};

const MEMBERSHIP_STATE_CLASSES: Record<MembershipState, string> = {
  invited: 'border-current text-[var(--color-ink-muted)]',
  active: 'border-emerald-700 text-emerald-700 dark:text-emerald-400',
  suspended: 'border-amber-600 text-amber-700 dark:text-amber-400',
  revoked: 'border-red-700 text-red-700 dark:text-red-400',
};

export function MembershipStateBadge({ state }: { state: MembershipState }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${MEMBERSHIP_STATE_CLASSES[state]}`}
    >
      {MEMBERSHIP_STATE_LABELS[state]}
    </span>
  );
}

// Mirrors `services/api-gateway/src/infrastructure/role.helper.ts`'s `ROLE_LABELS` — the
// single plain-language label for each role, so a role never reads differently on one
// screen (a raw capitalized enum) than another (the roles catalog / role-assignment control).
const ROLE_LABELS: Readonly<Record<WitnessRole, string>> = {
  admin: 'Administrator',
  facilitator: 'Facilitator',
  contributor: 'Contributor',
  reviewer: 'Reviewer',
  participant: 'Participant',
  reader: 'Read-only',
};

/**
 * The role a signed-in user holds in one organisation or workspace — display
 * only, never itself an authorisation decision (the server re-derives the
 * same answer independently on every request; see `PolicyEnforcementService`).
 * `null` means the membership exists but carries no role assignment yet
 * (Milestone 1.2: role assignment never happens implicitly), which is a
 * distinct, honest state from "no access" and must not be hidden.
 */
export function RoleBadge({ role }: { role: WitnessRole | null }) {
  if (role === null) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-current px-2 py-0.5 text-xs font-medium text-[var(--color-ink-muted)]">
        No role assigned yet
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-[var(--color-accent)] px-2 py-0.5 text-xs font-medium text-[var(--color-accent)]">
      {ROLE_LABELS[role]}
    </span>
  );
}

const SESSION_STATUS_LABELS: Record<SessionStatus, string> = {
  draft: 'Draft',
  scheduled: 'Scheduled',
  open: 'Open',
  closed: 'Closed',
  archived: 'Archived',
};

const SESSION_STATUS_CLASSES: Record<SessionStatus, string> = {
  draft: 'border-current text-[var(--color-ink-muted)]',
  scheduled: 'border-amber-600 text-amber-700 dark:text-amber-400',
  open: 'border-emerald-700 text-emerald-700 dark:text-emerald-400',
  closed: 'border-current text-[var(--color-ink-muted)]',
  archived: 'border-current text-[var(--color-ink-muted)]',
};

export function SessionStatusBadge({ status }: { status: SessionStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${SESSION_STATUS_CLASSES[status]}`}
    >
      {SESSION_STATUS_LABELS[status]}
    </span>
  );
}

const INVITATION_STATUS_LABELS: Record<ParticipantInvitationStatus, string> = {
  not_invited: 'Not invited',
  invited: 'Invited',
  accepted: 'Accepted',
  declined: 'Declined',
  cancelled: 'Cancelled',
};

const INVITATION_STATUS_CLASSES: Record<ParticipantInvitationStatus, string> = {
  not_invited: 'border-current text-[var(--color-ink-muted)]',
  invited: 'border-amber-600 text-amber-700 dark:text-amber-400',
  accepted: 'border-emerald-700 text-emerald-700 dark:text-emerald-400',
  declined: 'border-red-700 text-red-700 dark:text-red-400',
  cancelled: 'border-current text-[var(--color-ink-muted)]',
};

export function ParticipantInvitationBadge({ status }: { status: ParticipantInvitationStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${INVITATION_STATUS_CLASSES[status]}`}
    >
      {INVITATION_STATUS_LABELS[status]}
    </span>
  );
}

const ATTENDANCE_STATUS_LABELS: Record<ParticipantAttendanceStatus, string> = {
  expected: 'Expected',
  present: 'Present',
  absent: 'Absent',
  partially_attended: 'Partially attended',
  left_early: 'Left early',
};

const ATTENDANCE_STATUS_CLASSES: Record<ParticipantAttendanceStatus, string> = {
  expected: 'border-current text-[var(--color-ink-muted)]',
  present: 'border-emerald-700 text-emerald-700 dark:text-emerald-400',
  absent: 'border-red-700 text-red-700 dark:text-red-400',
  partially_attended: 'border-amber-600 text-amber-700 dark:text-amber-400',
  left_early: 'border-current text-[var(--color-ink-muted)]',
};

export function ParticipantAttendanceBadge({ status }: { status: ParticipantAttendanceStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${ATTENDANCE_STATUS_CLASSES[status]}`}
    >
      {ATTENDANCE_STATUS_LABELS[status]}
    </span>
  );
}

/**
 * Only the three states Milestone 5 can actually produce
 * (`draft`/`submitted`/`withdrawn`) get a distinct look here — the four
 * Milestone 6 review states exist in the type but render with a neutral
 * fallback, since no evidence in this milestone can ever reach them.
 */
const EVIDENCE_REVIEW_STATUS_LABELS: Record<EvidenceReviewStatus, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  under_review: 'Under review',
  needs_clarification: 'Needs clarification',
  validated: 'Validated',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
};

const EVIDENCE_REVIEW_STATUS_CLASSES: Record<EvidenceReviewStatus, string> = {
  draft: 'border-current text-[var(--color-ink-muted)]',
  submitted: 'border-amber-600 text-amber-700 dark:text-amber-400',
  under_review: 'border-amber-600 text-amber-700 dark:text-amber-400',
  needs_clarification: 'border-amber-600 text-amber-700 dark:text-amber-400',
  validated: 'border-emerald-700 text-emerald-700 dark:text-emerald-400',
  rejected: 'border-red-700 text-red-700 dark:text-red-400',
  withdrawn: 'border-current text-[var(--color-ink-muted)] line-through',
};

export function EvidenceReviewStatusBadge({ status }: { status: EvidenceReviewStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${EVIDENCE_REVIEW_STATUS_CLASSES[status]}`}
    >
      {EVIDENCE_REVIEW_STATUS_LABELS[status]}
    </span>
  );
}

const DECISION_STATUS_LABELS: Record<DecisionStatus, string> = {
  proposed: 'Proposed',
  confirmed: 'Confirmed',
  superseded: 'Superseded',
  reversed: 'Reversed',
};

/**
 * `superseded` and `reversed` look different on purpose. Superseding means
 * the decision was right and has moved on; reversing means it was wrong. A
 * reader scanning a register needs to tell those apart at a glance — see
 * `packages/domain/src/decision.ts`.
 */
const DECISION_STATUS_CLASSES: Record<DecisionStatus, string> = {
  proposed: 'border-amber-600 text-amber-700 dark:text-amber-400',
  confirmed: 'border-emerald-700 text-emerald-700 dark:text-emerald-400',
  superseded: 'border-current text-[var(--color-ink-muted)]',
  reversed: 'border-red-700 text-red-700 dark:text-red-400',
};

export function DecisionStatusBadge({ status }: { status: DecisionStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${DECISION_STATUS_CLASSES[status]}`}
    >
      {DECISION_STATUS_LABELS[status]}
    </span>
  );
}

const COMMITMENT_STATUS_LABELS: Record<CommitmentStatus, string> = {
  proposed: 'Proposed',
  active: 'Active',
  fulfilled: 'Fulfilled',
  withdrawn: 'Withdrawn',
  superseded: 'Superseded',
};

const COMMITMENT_STATUS_CLASSES: Record<CommitmentStatus, string> = {
  proposed: 'border-amber-600 text-amber-700 dark:text-amber-400',
  active: 'border-sky-700 text-sky-700 dark:text-sky-400',
  fulfilled: 'border-emerald-700 text-emerald-700 dark:text-emerald-400',
  withdrawn: 'border-current text-[var(--color-ink-muted)] line-through',
  superseded: 'border-current text-[var(--color-ink-muted)]',
};

export function CommitmentStatusBadge({ status }: { status: CommitmentStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${COMMITMENT_STATUS_CLASSES[status]}`}
    >
      {COMMITMENT_STATUS_LABELS[status]}
    </span>
  );
}

const ACTION_ITEM_STATUS_LABELS: Record<ActionItemStatus, string> = {
  open: 'Open',
  in_progress: 'In progress',
  blocked: 'Blocked',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

const ACTION_ITEM_STATUS_CLASSES: Record<ActionItemStatus, string> = {
  open: 'border-current text-[var(--color-ink-muted)]',
  in_progress: 'border-sky-700 text-sky-700 dark:text-sky-400',
  blocked: 'border-red-700 text-red-700 dark:text-red-400',
  completed: 'border-emerald-700 text-emerald-700 dark:text-emerald-400',
  cancelled: 'border-current text-[var(--color-ink-muted)] line-through',
};

export function ActionItemStatusBadge({ status }: { status: ActionItemStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${ACTION_ITEM_STATUS_CLASSES[status]}`}
    >
      {ACTION_ITEM_STATUS_LABELS[status]}
    </span>
  );
}

/** Shown next to an overdue commitment or action, never on a closed one. */
export function OverdueBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-red-700 px-2 py-0.5 text-xs font-medium text-red-700 dark:text-red-400">
      Overdue
    </span>
  );
}

/**
 * How many bases an outcome rests on, and whether that is enough for it to
 * be made authoritative. Zero is stated plainly rather than hidden — an
 * outcome with nothing behind it is exactly what a reader needs to notice.
 */
export function SupportCountBadge({ count }: { count: number }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${
        count === 0
          ? 'border-amber-600 text-amber-700 dark:text-amber-400'
          : 'border-current text-[var(--color-ink-muted)]'
      }`}
    >
      {count === 0 ? 'No basis recorded' : `${count} ${count === 1 ? 'basis' : 'bases'}`}
    </span>
  );
}

const REPORT_STATUS_LABELS: Record<ReportStatus, string> = {
  draft: 'Draft',
  under_review: 'Under review',
  approved: 'Approved',
  published_internally: 'Published internally',
  exported: 'Exported',
};

const REPORT_STATUS_CLASSES: Record<ReportStatus, string> = {
  draft: 'border-current text-[var(--color-ink-muted)]',
  under_review: 'border-amber-600 text-amber-700 dark:text-amber-400',
  approved: 'border-emerald-700 text-emerald-700 dark:text-emerald-400',
  published_internally: 'border-sky-700 text-sky-700 dark:text-sky-400',
  exported: 'border-sky-700 text-sky-700 dark:text-sky-400',
};

export function ReportStatusBadge({ status }: { status: ReportStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${REPORT_STATUS_CLASSES[status]}`}
    >
      {REPORT_STATUS_LABELS[status]}
    </span>
  );
}

/**
 * Plain-language framing for the well-known consent categories
 * (`packages/domain/src/consent-template.ts`'s `CONSENT_CATEGORIES`). A
 * template may also carry organisation-defined categories outside this set —
 * `categoryLabel`/`categoryHelp` fall back to the raw code for those, since
 * this UI cannot know what an organisation-invented category means. Shared
 * here (not duplicated per page) so the participant consent form and the
 * facilitator consent matrix describe the same category the same way.
 */
const CATEGORY_LABELS: Record<string, string> = {
  participation: 'Taking part',
  audio_recording: 'Audio recording',
  video_recording: 'Video recording',
  photography: 'Photos',
  evidence_submission: 'Submitting a document or photo as evidence',
  transcription: 'Transcription',
  ai_processing: 'Processing with local AI tools',
  attributed_quotation: 'Quoting them by name',
  anonymous_quotation: 'Quoting them anonymously',
  internal_use: 'Use within this organisation',
  external_reporting: 'Sharing in reports outside this organisation',
  publication: 'Publishing publicly',
  research_use: 'Use in research',
  future_reuse: 'Reuse in future programs',
  knowledge_graph_inclusion: "Linking into Witness's institutional record",
  follow_up_contact: 'Being contacted again about this',
};

const CATEGORY_HELP: Record<string, string> = {
  participation: 'They take part in this session at all.',
  audio_recording: 'Their voice is recorded during the session.',
  video_recording: 'They appear on video during the session.',
  photography: 'Photos are taken that may include them.',
  evidence_submission:
    'A document or photo they hand over is kept by Witness as part of the record. This is ' +
    'separate from recording or photographing them, and does not by itself allow anything ' +
    'further to be done with it.',
  transcription: 'A written transcript is made of what they said.',
  ai_processing:
    'A local AI tool (never sent off this server) summarises or extracts from what they said.',
  attributed_quotation: 'What they said can be quoted with their name attached.',
  anonymous_quotation: 'What they said can be quoted without saying who said it.',
  internal_use: 'Their contribution can be used inside this organisation.',
  external_reporting: 'Their contribution can appear in reports shared outside this organisation.',
  publication: 'Their contribution can be published where the public can see it.',
  research_use: 'Their contribution can be used for research.',
  future_reuse: 'Their contribution can be reused in a later program, not just this one.',
  knowledge_graph_inclusion:
    "Their contribution becomes part of Witness's longer-term institutional memory.",
  follow_up_contact: 'Someone from this program can contact them again later.',
};

export function categoryLabel(category: string): string {
  return CATEGORY_LABELS[category] ?? category.replace(/_/g, ' ');
}

export function categoryHelp(category: string): string | undefined {
  return CATEGORY_HELP[category];
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-lg border border-[var(--color-line)] bg-[var(--color-paper-raised)] p-5 ${className}`}
    >
      {children}
    </div>
  );
}

type ButtonVariant = 'primary' | 'secondary' | 'danger';

const BUTTON_VARIANT_STYLES: Record<ButtonVariant, string> = {
  primary: 'bg-[var(--color-accent)] text-[var(--color-accent-contrast)] hover:opacity-90',
  secondary:
    'border border-[var(--color-line)] bg-[var(--color-paper)] hover:bg-[var(--color-accent-soft)]',
  danger: 'border border-red-700 text-red-700 hover:bg-red-50 dark:hover:bg-red-950',
};

const BUTTON_BASE_CLASSES =
  'rounded px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50';

export function Button({
  children,
  onClick,
  type = 'button',
  variant = 'secondary',
  disabled = false,
  'aria-label': ariaLabel,
}: {
  children: ReactNode;
  onClick?: () => void;
  type?: 'button' | 'submit';
  variant?: ButtonVariant;
  disabled?: boolean;
  'aria-label'?: string;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className={`${BUTTON_BASE_CLASSES} ${BUTTON_VARIANT_STYLES[variant]}`}
    >
      {children}
    </button>
  );
}

/**
 * A navigation link styled like `Button`. Renders a single `<a>`, never a
 * `<button>` nested inside one — an `<a>` must not contain another
 * interactive element (invalid markup, inconsistent focus and
 * screen-reader behaviour), which `<Link><Button>...</Button></Link>`
 * produces.
 */
export function LinkButton({
  href,
  children,
  variant = 'secondary',
}: {
  href: string;
  children: ReactNode;
  variant?: ButtonVariant;
}) {
  return (
    <Link
      href={href}
      className={`inline-block ${BUTTON_BASE_CLASSES} ${BUTTON_VARIANT_STYLES[variant]}`}
    >
      {children}
    </Link>
  );
}

export function ErrorNotice({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="rounded border border-red-700 bg-red-50 p-4 text-sm text-red-900 dark:bg-red-950 dark:text-red-200"
    >
      {message}
    </div>
  );
}

/**
 * Assign, change, or remove a member's role in one organisation or
 * workspace — deliberately separate from membership status
 * (`MembershipStateBadge`/status actions above): membership answers "does
 * this person belong here", this answers "what may they do here"
 * (BUILD_ROADMAP.md Milestone 1.2).
 *
 * `assignment.role` may be `null` — no role assigned yet is the normal
 * starting state, not an error, so the control reads "No role assigned"
 * rather than showing an empty or broken-looking badge.
 */
export function RoleAssignmentControl({
  roles,
  assignment,
  busy,
  onAssign,
  onRemove,
}: {
  roles: RoleDefinition[];
  assignment: RoleAssignmentView;
  busy: boolean;
  onAssign: (role: string) => void;
  onRemove: () => void;
}) {
  const [selected, setSelected] = useState(assignment.role ?? '');

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div>
        {assignment.role === null ? (
          <span className="text-xs text-[var(--color-ink-muted)]">No role assigned</span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full border border-current px-2 py-0.5 text-xs font-medium text-[var(--color-ink)]">
            {assignment.roleLabel}
          </span>
        )}
      </div>
      <label className="sr-only" htmlFor={`role-${assignment.membershipId}`}>
        Role for {assignment.userDisplayName}
      </label>
      <select
        id={`role-${assignment.membershipId}`}
        value={selected}
        onChange={(event) => setSelected(event.target.value)}
        className="rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-2 py-1 text-xs"
      >
        <option value="">Choose a role…</option>
        {roles.map((definition) => (
          <option key={definition.role} value={definition.role} title={definition.description}>
            {definition.label}
          </option>
        ))}
      </select>
      <Button
        variant="secondary"
        disabled={busy || selected === '' || selected === assignment.role}
        onClick={() => onAssign(selected)}
      >
        {assignment.role === null ? 'Assign role' : 'Change role'}
      </Button>
      {assignment.role !== null && (
        <Button variant="danger" disabled={busy} onClick={onRemove}>
          Remove role
        </Button>
      )}
    </div>
  );
}

export function NotImplemented({ capability, phase }: { capability: string; phase: string }) {
  return (
    <div className="rounded border border-dashed border-[var(--color-line)] p-4 text-sm text-[var(--color-ink-muted)]">
      <p className="font-medium text-[var(--color-ink)]">
        Developer Preview — capability not yet implemented
      </p>
      <p className="mt-1">
        {capability} arrives in {phase}. Nothing is being simulated here; when this is built, this
        panel is replaced by the real thing.
      </p>
    </div>
  );
}

/** A palette cycled by a stable hash of the name — the same person gets the same colour every time, without storing one. */
const AVATAR_PALETTE = [
  'oklch(0.55 0.14 250)',
  'oklch(0.55 0.13 20)',
  'oklch(0.55 0.13 145)',
  'oklch(0.55 0.14 300)',
  'oklch(0.55 0.15 60)',
  'oklch(0.55 0.13 190)',
];

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0]}${parts[parts.length - 1]![0]}`.toUpperCase();
}

const AVATAR_SIZE_CLASSES = {
  sm: 'h-8 w-8 text-xs',
  md: 'h-11 w-11 text-sm',
  lg: 'h-16 w-16 text-lg',
};

/**
 * No photo upload in this build — an initials avatar gives every person a
 * consistent, recognisable visual identity in the People directory and on
 * their profile without one, and never needs a broken-image fallback.
 */
export function Avatar({
  name,
  size = 'md',
}: {
  name: string;
  size?: keyof typeof AVATAR_SIZE_CLASSES;
}) {
  const colour = AVATAR_PALETTE[hashString(name) % AVATAR_PALETTE.length];
  return (
    <span
      aria-hidden="true"
      className={`inline-flex flex-shrink-0 items-center justify-center rounded-full font-semibold text-white ${AVATAR_SIZE_CLASSES[size]}`}
      style={{ backgroundColor: colour }}
    >
      {initials(name)}
    </span>
  );
}

/**
 * A card presenting a person — the People directory's building block, and
 * deliberately reused nowhere near an admin table. `href` makes the whole
 * card a link to that person's profile when one exists.
 */
export function PersonCard({
  name,
  subtitle,
  bio,
  badge,
  href,
}: {
  name: string;
  subtitle?: string;
  bio?: string | null;
  badge?: ReactNode;
  href?: string;
}) {
  const content = (
    <Card className="flex h-full flex-col gap-3">
      <div className="flex items-start gap-3">
        <Avatar name={name} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{name}</p>
          {subtitle !== undefined && (
            <p className="truncate text-sm text-[var(--color-ink-muted)]">{subtitle}</p>
          )}
        </div>
        {badge}
      </div>
      {bio !== undefined && bio !== null && bio.trim() !== '' && (
        <p className="line-clamp-3 text-sm text-[var(--color-ink-muted)]">{bio}</p>
      )}
    </Card>
  );

  if (href === undefined) return content;

  return (
    <Link href={href} className="block h-full rounded-lg focus-visible:outline-none">
      {content}
    </Link>
  );
}

/**
 * A major empty screen that tells the reader what to do next rather than
 * just what is missing — an empty state should enable the next action, not
 * be a dead end (Client-Ready Experience, Phase 21).
 */
export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <Card className="flex flex-col items-start gap-3 border-dashed py-8 text-center sm:items-center sm:text-center">
      <p className="font-medium">{title}</p>
      <p className="max-w-md text-sm text-[var(--color-ink-muted)]">{body}</p>
      {action}
    </Card>
  );
}
