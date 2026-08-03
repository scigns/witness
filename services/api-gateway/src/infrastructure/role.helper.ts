/**
 * Plain-language role labels and descriptions — shared by the roles catalog
 * and the organisation/workspace role-assignment views, so the UI never has
 * to show a raw role identifier as its only explanation
 * (BUILD_ROADMAP.md Milestone 1.2: "Do not expose raw internal permission
 * strings as the only user-facing explanation").
 */

import { permittedActionsForRole, WITNESS_ROLES, type WitnessRole } from '@witness/domain';
import type { RoleDefinition } from '@witness/contracts';

const ROLE_LABELS: Readonly<Record<WitnessRole, string>> = Object.freeze({
  admin: 'Administrator',
  facilitator: 'Facilitator',
  contributor: 'Contributor',
  reviewer: 'Reviewer',
  participant: 'Participant',
  reader: 'Read-only',
});

const ROLE_DESCRIPTIONS: Readonly<Record<WitnessRole, string>> = Object.freeze({
  admin: 'Manages members and role assignments in this organisation or workspace.',
  facilitator: 'Runs sessions and adds evidence, without review authority.',
  contributor: 'Adds evidence, without review authority.',
  reviewer: 'Adds evidence and confirms it into the institutional record.',
  participant: 'Can see what has been recorded.',
  reader: 'Can see what has been recorded, and nothing more.',
});

export function roleLabel(role: WitnessRole): string {
  return ROLE_LABELS[role];
}

export function roleCatalog(): RoleDefinition[] {
  return WITNESS_ROLES.map((role) => ({
    role,
    label: ROLE_LABELS[role],
    description: ROLE_DESCRIPTIONS[role],
    permittedActions: [...permittedActionsForRole(role)],
  }));
}
