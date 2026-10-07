/**
 * Resource-usage warning thresholds (commercial-runtime-readiness work).
 * Configuration, not a notification system: this module only identifies
 * which threshold a percentage has crossed, so a caller can log a
 * structured event or (later) wire a real notification off of it. Nothing
 * here sends an email or writes a row.
 */

export const USAGE_WARNING_THRESHOLDS = [70, 85, 95, 100] as const;
export type UsageWarningThreshold = (typeof USAGE_WARNING_THRESHOLDS)[number];

/** The highest configured threshold a percentage has reached, or `null` below the lowest one. */
export function crossedThreshold(percentageUsed: number): UsageWarningThreshold | null {
  let crossed: UsageWarningThreshold | null = null;
  for (const threshold of USAGE_WARNING_THRESHOLDS) {
    if (percentageUsed >= threshold) crossed = threshold;
  }
  return crossed;
}
