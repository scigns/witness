'use client';

/**
 * Facilitator bulk upload (Phase 5, Workstream 1.7) — drag a stack of scanned
 * documents or photos in at once instead of the single-item evidence page's
 * one-at-a-time flow.
 *
 * Each file becomes its own Evidence row, sourceless
 * (`institutional_source`, `packages/domain/src/evidence.ts`'s
 * `SOURCELESS_MODES`) — a bulk-uploaded document represents an institutional
 * record, not one participant's contribution, so it carries no
 * `sourceParticipantId` and triggers no consent check (mirrors how
 * `EvidenceService.capture()` already treats any sourceless mode). A
 * facilitator who wants to attribute a specific item to a specific
 * participant still uses the existing single-item evidence page.
 *
 * Reuses the same two API calls the single-item flow already uses
 * (`captureEvidence` then `uploadEvidenceAttachment`) — no new backend
 * surface, only client-side orchestration: per-file validation before any
 * network call, independent per-file status so one bad file never blocks
 * the rest, and a stable per-file `clientRequestId` so retrying a failed
 * file after its evidence row already committed resolves to that same row
 * (the server's existing idempotency guarantee) rather than creating a
 * duplicate.
 */

import Link from 'next/link';
import { use, useCallback, useRef, useState } from 'react';

import { api, ApiError } from '@/lib/api';
import { useSession } from '@/lib/session';
import { Button, Card } from '@/components/ui';

const ALLOWED_CONTENT_TYPES = new Set([
  'audio/mpeg',
  'audio/mp4',
  'audio/aac',
  'audio/wav',
  'audio/x-wav',
  'audio/webm',
  'audio/ogg',
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
]);

const MAX_FILE_MB = 200;

type FileStatus = 'pending' | 'creating' | 'uploading' | 'done' | 'failed';

interface QueuedFile {
  clientRequestId: string;
  file: File;
  status: FileStatus;
  error: string | null;
  evidenceId: string | null;
  /**
   * Set once, at `addFiles` time, and never touched afterward. Distinct
   * from a `'failed'` status caused by a network/server error: retrying a
   * *rejected* file would call `captureEvidence` for a file the server
   * would refuse anyway on the attachment step, leaving a real, empty
   * Evidence row behind with no attachment — confirmed live before this
   * fix. A rejected file is never retryable, only removable.
   */
  rejected: boolean;
}

function newClientRequestId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`;
}

function validateFile(file: File): string | null {
  if (!ALLOWED_CONTENT_TYPES.has(file.type)) {
    return `'${file.type || 'unknown type'}' is not a supported format (PDF, JPEG, PNG, WebP, or common audio formats only).`;
  }
  if (file.size > MAX_FILE_MB * 1024 * 1024) {
    return `This file is ${Math.ceil(file.size / (1024 * 1024))} MB. The limit is ${MAX_FILE_MB} MB.`;
  }
  return null;
}

export default function BulkUploadPage({
  params,
}: {
  params: Promise<{ id: string; sessionId: string }>;
}) {
  const { id: workspaceId, sessionId } = use(params);
  const { user } = useSession();

  const [files, setFiles] = useState<QueuedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const addFiles = useCallback((incoming: FileList | File[]) => {
    const next: QueuedFile[] = Array.from(incoming).map((file) => {
      const validationError = validateFile(file);
      return {
        clientRequestId: newClientRequestId(),
        file,
        status: validationError !== null ? 'failed' : 'pending',
        error: validationError,
        evidenceId: null,
        rejected: validationError !== null,
      };
    });
    setFiles((current) => [...current, ...next]);
  }, []);

  const uploadOne = useCallback(
    async (item: QueuedFile) => {
      if (user === null || item.rejected) return;
      setFiles((current) =>
        current.map((f) =>
          f.clientRequestId === item.clientRequestId
            ? { ...f, status: 'creating', error: null }
            : f,
        ),
      );
      try {
        let evidenceId = item.evidenceId;
        if (evidenceId === null) {
          const detail = await api.captureEvidence(
            workspaceId,
            sessionId,
            {
              evidenceType: 'document',
              title: item.file.name,
              content: `Bulk-uploaded file: ${item.file.name}`,
              attributionMode: 'institutional_source',
              submitImmediately: true,
              clientRequestId: item.clientRequestId,
            },
            user,
          );
          evidenceId = detail.id;
        }
        setFiles((current) =>
          current.map((f) =>
            f.clientRequestId === item.clientRequestId
              ? { ...f, status: 'uploading', evidenceId }
              : f,
          ),
        );
        await api.uploadEvidenceAttachment(workspaceId, sessionId, evidenceId, item.file, user);
        setFiles((current) =>
          current.map((f) =>
            f.clientRequestId === item.clientRequestId ? { ...f, status: 'done', evidenceId } : f,
          ),
        );
      } catch (caught) {
        const message = caught instanceof ApiError ? caught.message : 'Upload failed.';
        setFiles((current) =>
          current.map((f) =>
            f.clientRequestId === item.clientRequestId
              ? { ...f, status: 'failed', error: message }
              : f,
          ),
        );
      }
    },
    [workspaceId, sessionId, user],
  );

  const uploadAll = async () => {
    setUploading(true);
    // Sequential, deliberately: a facilitator bulk-uploading dozens of scans
    // at once must not burst the server's storage-quota and evidence-write
    // paths all at once — one at a time keeps per-file failure isolated and
    // easy to read from the list below as it progresses.
    const pending = files.filter(
      (f) => !f.rejected && (f.status === 'pending' || f.status === 'failed'),
    );
    for (const item of pending) {
      await uploadOne(item);
    }
    setUploading(false);
  };

  const removeFile = (clientRequestId: string) => {
    setFiles((current) => current.filter((f) => f.clientRequestId !== clientRequestId));
  };

  const pendingCount = files.filter((f) => f.status === 'pending').length;
  const failedCount = files.filter((f) => f.status === 'failed' && !f.rejected).length;
  const doneCount = files.filter((f) => f.status === 'done').length;
  const rejectedCount = files.filter((f) => f.rejected).length;

  return (
    <div className="space-y-6">
      <Link
        href={`/workspaces/${workspaceId}/sessions/${sessionId}/evidence`}
        className="inline-block text-sm underline"
      >
        ← Back to evidence
      </Link>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Bulk upload</h1>
        <p className="mt-1 text-[var(--color-ink-muted)]">
          Add several documents or photos at once — each becomes its own evidence record, uploaded
          independently so one failure never blocks the rest.
        </p>
      </div>

      <Card
        className={`space-y-3 border-2 border-dashed text-center ${dragOver ? 'border-[var(--color-accent)]' : 'border-[var(--color-line)]'}`}
      >
        <div
          onDragOver={(event) => {
            event.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragOver(false);
            if (event.dataTransfer.files.length > 0) addFiles(event.dataTransfer.files);
          }}
          className="space-y-3 py-8"
        >
          <p className="text-sm text-[var(--color-ink)]">
            Drag files here, or{' '}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="underline"
            >
              choose files
            </button>
          </p>
          <p className="text-xs text-[var(--color-ink-muted)]">
            PDF, JPEG, PNG, WebP, or audio. Up to {MAX_FILE_MB} MB each.
          </p>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="sr-only"
            onChange={(event) => {
              if (event.target.files !== null) addFiles(event.target.files);
              event.target.value = '';
            }}
          />
        </div>
      </Card>

      {files.length > 0 && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-[var(--color-ink-muted)]">
              {doneCount} done · {pendingCount} pending · {failedCount} failed
              {rejectedCount > 0 ? ` · ${rejectedCount} rejected` : ''}
            </p>
            <Button
              variant="primary"
              disabled={uploading || (pendingCount === 0 && failedCount === 0)}
              onClick={() => void uploadAll()}
            >
              {uploading ? 'Uploading…' : 'Upload all'}
            </Button>
          </div>

          <ul className="divide-y divide-[var(--color-line)]">
            {files.map((item) => (
              <li
                key={item.clientRequestId}
                className="flex items-center justify-between gap-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-[var(--color-ink)]">
                    {item.file.name}
                  </p>
                  {item.error !== null && (
                    <p className="text-xs text-[var(--color-attention)]">{item.error}</p>
                  )}
                </div>
                <span className="text-xs text-[var(--color-ink-muted)]">
                  {item.status === 'creating'
                    ? 'Creating…'
                    : item.status === 'uploading'
                      ? 'Uploading…'
                      : item.status === 'done'
                        ? 'Done'
                        : item.status === 'failed'
                          ? 'Failed'
                          : 'Waiting'}
                </span>
                {item.status === 'failed' && !item.rejected && (
                  <Button variant="secondary" onClick={() => void uploadOne(item)}>
                    Retry
                  </Button>
                )}
                {item.status !== 'creating' && item.status !== 'uploading' && (
                  <Button variant="secondary" onClick={() => removeFile(item.clientRequestId)}>
                    Remove
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
