'use client';

/**
 * Mobile-first audio recorder (Phase 5, Workstream 1.4) — the core control
 * of the Quick Capture flow: record, stop, confirm, in three taps or fewer.
 *
 * The `MediaRecorder` lifecycle here mirrors the facilitator-side recorder
 * already proven in `evidence/[evidenceId]/page.tsx` (feature detection,
 * mimetype negotiation, timer, cleanup-on-unmount) — this component is that
 * same logic, restyled for a phone held by someone who has never used
 * Witness before: one large control, an unmistakable active/recording
 * state, and every affordance reachable by tap alone (no control here
 * depends on `:hover`, which a touchscreen never fires).
 */

import { useEffect, useRef, useState } from 'react';

export type RecorderStatus = 'idle' | 'recording' | 'paused' | 'stopped';

function pickRecordingMimeType(): string | undefined {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
    return undefined;
  }
  return candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate));
}

function formatElapsed(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function AudioRecorder({
  onSubmit,
  submitting,
  submitLabel = 'Submit',
}: {
  onSubmit: (blob: Blob, mimeType: string, durationSeconds: number) => void;
  submitting: boolean;
  submitLabel?: string;
}) {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [status, setStatus] = useState<RecorderStatus>('idle');
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordedBlobRef = useRef<{ blob: Blob; mimeType: string } | null>(null);

  useEffect(() => {
    try {
      setSupported(
        typeof window !== 'undefined' &&
          'MediaRecorder' in window &&
          typeof navigator !== 'undefined' &&
          navigator.mediaDevices?.getUserMedia !== undefined,
      );
    } catch {
      setSupported(false);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) clearInterval(timerRef.current);
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
      if (previewUrl !== null) URL.revokeObjectURL(previewUrl);
    };
  }, []);

  /**
   * A recording (in progress, paused, or stopped-but-not-yet-submitted)
   * exists only in memory — closing the tab, reloading, or navigating away
   * loses it with no way to recover it, unlike a submitted contribution
   * (server-persisted) or an offline-queued one (IndexedDB-persisted). The
   * browser's native confirmation dialog is the only cross-browser way to
   * warn before that happens; the custom message text is ignored by every
   * modern browser, but setting `returnValue` is still what triggers the
   * dialog at all.
   */
  useEffect(() => {
    if (status === 'idle') return;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => window.removeEventListener('beforeunload', warnBeforeUnload);
  }, [status]);

  const start = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      chunksRef.current = [];
      const mimeType = pickRecordingMimeType();
      const recorder = new MediaRecorder(stream, mimeType !== undefined ? { mimeType } : undefined);
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        recordedBlobRef.current = { blob, mimeType: recorder.mimeType || 'audio/webm' };
        setPreviewUrl(URL.createObjectURL(blob));
        mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setStatus('recording');
      setSeconds(0);
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? `Could not start recording: ${caught.message}`
          : 'Could not start recording. Check microphone permission and try again.',
      );
    }
  };

  const pause = () => {
    mediaRecorderRef.current?.pause();
    if (timerRef.current !== null) clearInterval(timerRef.current);
    setStatus('paused');
  };

  const resume = () => {
    mediaRecorderRef.current?.resume();
    timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    setStatus('recording');
  };

  const stop = () => {
    mediaRecorderRef.current?.stop();
    if (timerRef.current !== null) clearInterval(timerRef.current);
    setStatus('stopped');
  };

  const discard = () => {
    if (previewUrl !== null) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    recordedBlobRef.current = null;
    setSeconds(0);
    setStatus('idle');
  };

  const confirm = () => {
    const recorded = recordedBlobRef.current;
    if (recorded === null) return;
    onSubmit(recorded.blob, recorded.mimeType, seconds);
  };

  if (supported === false) {
    return (
      <p role="alert" className="text-sm text-[var(--color-attention)]">
        This browser cannot record audio. Try a recent version of Chrome, Safari, or Firefox.
      </p>
    );
  }

  if (supported === null) {
    return null;
  }

  return (
    <div className="flex flex-col items-center gap-4">
      {error !== null && (
        <p role="alert" className="text-center text-sm text-[var(--color-attention)]">
          {error}
        </p>
      )}

      {status === 'idle' && (
        <button
          type="button"
          onClick={() => void start()}
          aria-label="Start recording"
          className="flex h-32 w-32 items-center justify-center rounded-full bg-[var(--color-accent)] text-[var(--color-accent-contrast)] shadow-lg transition-transform active:scale-95"
        >
          <span className="h-12 w-12 rounded-full bg-[var(--color-accent-contrast)]" />
        </button>
      )}

      {(status === 'recording' || status === 'paused') && (
        <>
          <div className="flex items-center gap-2" role="status">
            <span
              className={`h-3 w-3 rounded-full ${
                status === 'recording'
                  ? 'animate-pulse bg-[var(--color-attention)]'
                  : 'bg-[var(--color-ink-muted)]'
              }`}
              aria-hidden="true"
            />
            <span className="font-mono text-2xl tabular-nums text-[var(--color-ink)]">
              {formatElapsed(seconds)}
            </span>
            <span className="text-sm text-[var(--color-ink-muted)]">
              {status === 'recording' ? 'Recording' : 'Paused'}
            </span>
          </div>

          <button
            type="button"
            onClick={stop}
            aria-label="Stop recording"
            className="flex h-32 w-32 items-center justify-center rounded-full bg-[var(--color-attention)] text-[var(--color-accent-contrast)] shadow-lg transition-transform active:scale-95"
          >
            <span className="h-10 w-10 rounded bg-[var(--color-accent-contrast)]" />
          </button>

          <button
            type="button"
            onClick={status === 'recording' ? pause : resume}
            className="rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-4 py-2 text-sm font-medium"
          >
            {status === 'recording' ? 'Pause' : 'Resume'}
          </button>
        </>
      )}

      {status === 'stopped' && previewUrl !== null && (
        <div className="w-full space-y-4">
          <p className="text-center text-sm text-[var(--color-ink-muted)]">
            {formatElapsed(seconds)} recorded
          </p>

          <audio controls src={previewUrl} className="w-full" />
          <div className="flex gap-3">
            <button
              type="button"
              onClick={discard}
              disabled={submitting}
              className="flex-1 rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-4 py-4 text-base font-medium disabled:opacity-50"
            >
              Discard &amp; retry
            </button>
            <button
              type="button"
              onClick={confirm}
              disabled={submitting}
              className="flex-1 rounded bg-[var(--color-accent)] px-4 py-4 text-base font-semibold text-[var(--color-accent-contrast)] disabled:opacity-50"
            >
              {submitting ? 'Submitting…' : submitLabel}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
