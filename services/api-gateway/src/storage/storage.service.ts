/**
 * `objectKey()` — the one place a storage key is built, so every caller
 * isolates by tenant the same way. Prefixed by organisation, so a lifted
 * per-tenant IAM policy or a bucket-per-tenant migration later (Flight 1's
 * "the abstraction must permit a tenant to move later to its own bucket") is
 * a prefix change, not an application rewrite — and so a bug in one
 * consumer cannot produce a key that reads another organisation's object,
 * because there is no path to constructing one that does not start here.
 */

import type { StoragePort } from './storage.port.js';

export type StorageKind = 'evidence-attachment' | 'resource';

export function objectKey(input: {
  organisationId: string;
  kind: StorageKind;
  id: string;
}): string {
  return `${input.organisationId}/${input.kind}/${input.id}`;
}

/**
 * Resolves the bytes behind a row that carries exactly one of
 * `content`/`storageKey` (`EvidenceAttachment`, `Resource`) — the one place
 * that branch is read, shared by every consumer (`EvidenceAttachmentService`,
 * `TranscriptService`'s background job) so a future third one cannot forget
 * the `storageKey` half. Throws a plain `Error` rather than a Nest HTTP
 * exception: `TranscriptService`'s background job is not a request/response
 * cycle, and its existing catch block turns any thrown error into a clean
 * `failed` transcript with the message as the reason — the same resilience
 * path a corrupt or unsupported recording already takes.
 */
export async function resolveStoredContent(
  storage: StoragePort | null,
  row: { content: Buffer | null; storageKey: string | null },
): Promise<Buffer> {
  if (row.storageKey !== null) {
    if (storage === null) {
      throw new Error(
        'This attachment is in object storage, which is not configured on this deployment.',
      );
    }
    const stored = await storage.get(row.storageKey);
    if (stored === null) {
      throw new Error('This attachment has a record but its object is missing from storage.');
    }
    return stored.content;
  }

  if (row.content === null) {
    throw new Error('This attachment has a record with no content in either storage.');
  }

  return row.content;
}
