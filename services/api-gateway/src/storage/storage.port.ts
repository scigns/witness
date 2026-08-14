/**
 * StoragePort — the integration boundary for an S3-compatible object store
 * (Cloudflare R2 in production; MinIO in the `full` local dev profile — see
 * `infrastructure/docker/docker-compose.yml`), same reasoning as
 * `TranscriptionPort` (a Nest DI token as an abstract class, because an
 * `interface` does not survive compilation and cannot be injected against).
 *
 * `S3StorageAdapter` is the only implementation. It is provided only when
 * `WitnessConfig.objectStorageEnabled` is true — the deployment profile is
 * `hybrid` *and* S3 credentials are configured, the same "profile permits it
 * AND it is actually configured" shape as `externalInferenceEnabled`.
 * Consumers (`EvidenceAttachmentService`, `ResourcesService`) inject it as
 * `@Optional()` and fall back to the pre-existing behaviour — bytes on the
 * row's own `content` column — when it is not provided.
 *
 * That fallback is deliberate, not a stopgap being phased out: ADR-0009
 * forbids the `sovereign` profile from any external call for institutional
 * content, and storing bytes in Postgres is also the documented reasoning
 * for that profile specifically (`packages/config/src/index.ts`'s comment on
 * `WITNESS_MAX_EVIDENCE_ATTACHMENT_MB`) — one system of record, so the
 * existing Postgres backup covers it for free, no second unbacked-up volume
 * to lose. This port exists for the *other* case: a `hybrid`, managed,
 * multi-tenant deployment, where large binary content belongs out of the
 * primary database, isolated per tenant by key prefix (see `objectKey()` in
 * `storage.service.ts`, the one place that builds one) so a 5 GB-per-
 * organisation quota and per-tenant export mean something at the storage
 * layer, not just in application logic. This is what ADR-0004 originally
 * specified ("Object storage (MinIO/S3) holds media and documents...
 * Authoritative: Yes... Backed up: Yes").
 */

export interface StoredObject {
  readonly content: Buffer;
  readonly contentType: string;
}

export abstract class StoragePort {
  abstract put(key: string, content: Buffer, contentType: string): Promise<void>;
  abstract get(key: string): Promise<StoredObject | null>;
  abstract delete(key: string): Promise<void>;
}
