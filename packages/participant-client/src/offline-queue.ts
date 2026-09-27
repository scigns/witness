/**
 * Offline contribution queue (low-connectivity Level 3) — extracted from
 * `apps/web/src/lib/offline-queue.ts` unchanged in behaviour, for both
 * `apps/web` and `apps/participant-mobile` to share (ADR-0031).
 *
 * IndexedDB, not a native filesystem bridge: `docs/mobile/OFFLINE_STORAGE.md`
 * records the explicit evaluation this decision needed — a Capacitor
 * WebView on both iOS and Android exposes a real IndexedDB implementation,
 * including `Blob` storage, so a native filesystem bridge is not
 * *necessary* today. It becomes necessary the moment physical-device
 * evidence shows otherwise (the same "reuse until evidence says
 * otherwise" discipline ADR-0031 already applied to audio), not before.
 *
 * Each queued item carries a client-generated `clientRequestId` (a UUID),
 * which the API's evidence-capture endpoint treats as an idempotency key:
 * retrying the same queued item after reconnect — including a retry that
 * races a response which actually landed — resolves to one evidence row,
 * never a duplicate (`docs/mobile/PARTICIPANT_API_CONTRACT.md`'s
 * idempotency rows). That server-side guarantee is what makes queuing and
 * retrying safe at all; this module does not invent its own conflict
 * resolution because it does not need one.
 */

import type { CaptureEvidenceRequest, ParticipantCaptureEvidenceRequest } from '@witness/contracts';

const DB_NAME = 'witness-offline-queue';
const DB_VERSION = 1;
const STORE_NAME = 'queued-contributions';

export type QueueItemStatus = 'pending' | 'syncing' | 'synced' | 'failed';

/** A facilitator/contributor capture, sent with their signed-in session. Not used by the participant-only mobile client — kept here only because the underlying store is shared with apps/web. */
export interface QueuedFacilitatorContribution {
  kind: 'facilitator';
  /** The clientRequestId — doubles as the IndexedDB key and the API idempotency key. */
  id: string;
  workspaceId: string;
  sessionId: string;
  body: CaptureEvidenceRequest;
  status: QueueItemStatus;
  createdAt: number;
  lastError: string | null;
}

/**
 * A participant self-capture — same idempotency discipline, but authorised
 * by a capture token rather than a signed-in session, and carrying the
 * recorded audio inline: IndexedDB stores `Blob`s natively, so the
 * attachment survives a closed tab/backgrounded app exactly like the text
 * fields do, and is uploaded once the evidence row itself confirms.
 */
export interface QueuedParticipantContribution {
  kind: 'participant';
  id: string;
  sessionId: string;
  captureToken: string;
  body: ParticipantCaptureEvidenceRequest;
  attachment: { blob: Blob; filename: string } | null;
  status: QueueItemStatus;
  createdAt: number;
  lastError: string | null;
}

export type QueuedContribution = QueuedFacilitatorContribution | QueuedParticipantContribution;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available in this environment.'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Failed to open offline queue.'));
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode);
    const store = tx.objectStore(STORE_NAME);
    const req = fn(store);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Offline queue operation failed.'));
  });
}

export async function enqueue(item: QueuedContribution): Promise<void> {
  await withStore('readwrite', (store) => store.put(item));
}

export async function listAll(): Promise<QueuedContribution[]> {
  try {
    return await withStore<QueuedContribution[]>('readonly', (store) => store.getAll());
  } catch {
    // No IndexedDB (private browsing, disabled) — an empty queue is a safe
    // default; the caller falls back to "submission failed, try again."
    return [];
  }
}

export async function listForSession(
  workspaceId: string,
  sessionId: string,
): Promise<QueuedFacilitatorContribution[]> {
  const all = await listAll();
  return all.filter(
    (item): item is QueuedFacilitatorContribution =>
      item.kind === 'facilitator' &&
      item.workspaceId === workspaceId &&
      item.sessionId === sessionId,
  );
}

export async function listForParticipantSession(
  sessionId: string,
): Promise<QueuedParticipantContribution[]> {
  const all = await listAll();
  return all.filter(
    (item): item is QueuedParticipantContribution =>
      item.kind === 'participant' && item.sessionId === sessionId,
  );
}

export async function updateStatus(
  id: string,
  status: QueueItemStatus,
  lastError: string | null = null,
): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const existing = getReq.result as QueuedContribution | undefined;
      if (existing === undefined) {
        resolve();
        return;
      }
      const putReq = store.put({ ...existing, status, lastError });
      putReq.onsuccess = () => resolve();
      putReq.onerror = () => reject(putReq.error ?? new Error('Failed to update queue item.'));
    };
    getReq.onerror = () => reject(getReq.error ?? new Error('Failed to read queue item.'));
  });
}

export async function remove(id: string): Promise<void> {
  await withStore('readwrite', (store) => store.delete(id));
}

/** True for a genuine network failure — never for a real server rejection (4xx/5xx). */
export function isNetworkFailure(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    (error as { status: unknown }).status === 0
  );
}
