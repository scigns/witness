/**
 * One `clientRequestId` per contribution *attempt*, generated before the
 * first network call and reused on every retry of that same attempt — this
 * is what makes "retry never duplicates evidence"
 * (`docs/mobile/PARTICIPANT_API_CONTRACT.md`'s idempotency rows) true. A
 * caller that generates a fresh id per retry defeats the guarantee the
 * server already provides.
 */
export function newClientRequestId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`;
}
