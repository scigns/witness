/**
 * SupportLevel: the `support.level` entitlement's value vocabulary. This
 * key already existed before ADR-0034's commercial-entitlement work (seeded
 * by the original C1 commercial foundation migration) — this file names
 * the existing seeded vocabulary (`community`/`email`/`priority`/`sla`)
 * rather than introducing a new, differently-spelled one. Renaming already-
 * seeded commercial data for cosmetic consistency with a brief's suggested
 * names is exactly the "broad cosmetic renaming" this work was told not to
 * do.
 */
export const SUPPORT_LEVELS = ['community', 'email', 'priority', 'sla'] as const;

export type SupportLevel = (typeof SUPPORT_LEVELS)[number];
