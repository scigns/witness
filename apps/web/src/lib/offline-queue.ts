/**
 * Offline contribution queue (low-connectivity Level 3).
 *
 * Scoped deliberately narrow: only the evidence "share a contribution"
 * write path queues offline, not the whole application. That path is the
 * one the low-connectivity promise is actually about — a participant on a
 * bad connection needs their words saved locally the moment the network
 * drops, not a generic offline framework for every screen.
 *
 * Each queued item carries a client-generated `clientRequestId` (a UUID),
 * which the API's evidence-capture endpoint treats as an idempotency key
 * (`services/api-gateway/src/evidence/evidence.service.ts`'s `capture()`):
 * retrying the same queued item after reconnect — including a retry that
 * races a response which actually landed — resolves to one evidence row,
 * never a duplicate. That server-side guarantee is what makes queuing and
 * retrying safe at all; this module does not invent its own conflict
 * resolution because it does not need one.
 *
 * IndexedDB, not localStorage: a queued contribution can be a full evidence
 * payload up to 20,000 characters, worth keeping in a real database rather
 * than a synchronous, size-limited string store — and IndexedDB survives a
 * closed tab, which localStorage does for small data too but this is the
 * more correct tool for a small structured record store either way.
 */

'use client';

import type { CaptureEvidenceRequest } from '@witness/contracts';

const DB_NAME = 'witness-offline-queue';
const DB_VERSION = 1;
const STORE_NAME = 'queued-contributions';

export type QueueItemStatus = 'pending' | 'syncing' | 'synced' | 'failed';

export interface QueuedContribution {
  /** The clientRequestId — doubles as the IndexedDB key and the API idempotency key. */
  id: string;
  workspaceId: string;
  sessionId: string;
  body: CaptureEvidenceRequest;
  status: QueueItemStatus;
  createdAt: number;
  lastError: string | null;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available in this browser.'));
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
): Promise<QueuedContribution[]> {
  const all = await listAll();
  return all.filter((item) => item.workspaceId === workspaceId && item.sessionId === sessionId);
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
