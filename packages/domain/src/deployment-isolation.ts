/**
 * DeploymentIsolation (ADR-0034): the contracted technical-isolation tier an
 * organisation's plan or negotiated override entitles it to. This is the
 * *commercial* fact ("what is this organisation entitled to"), resolved
 * through the ordinary `deployment.isolation` entitlement key — not an
 * infrastructure-provisioning instruction, and not coupled to any provider.
 *
 * Deliberately four tiers, not a boolean: a plan default and a negotiated
 * override both need to express more than "dedicated or not."
 */
export const DEPLOYMENT_ISOLATION_TIERS = [
  'SHARED',
  'ISOLATED_DATA',
  'DEDICATED',
  'SOVEREIGN',
] as const;

export type DeploymentIsolationTier = (typeof DEPLOYMENT_ISOLATION_TIERS)[number];
