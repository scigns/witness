'use client';

/**
 * Small shared presentation pieces.
 *
 * `packages/ui` is where the real design system lives (Phase 6, roadmap 6.3).
 * These are deliberately minimal and local so that the preview does not create
 * a second component library that the design system would later have to
 * reconcile with.
 */

import { useState, type ReactNode } from 'react';

import type {
  MembershipState,
  ReviewState,
  RoleAssignmentView,
  RoleDefinition,
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
      {role.charAt(0).toUpperCase() + role.slice(1)}
    </span>
  );
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

export function Button({
  children,
  onClick,
  type = 'button',
  variant = 'secondary',
  disabled = false,
}: {
  children: ReactNode;
  onClick?: () => void;
  type?: 'button' | 'submit';
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
}) {
  const styles = {
    primary: 'bg-[var(--color-accent)] text-white hover:opacity-90',
    secondary:
      'border border-[var(--color-line)] bg-[var(--color-paper)] hover:bg-[var(--color-accent-soft)]',
    danger: 'border border-red-700 text-red-700 hover:bg-red-50 dark:hover:bg-red-950',
  }[variant];

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`rounded px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${styles}`}
    >
      {children}
    </button>
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
