/**
 * Adapted from `apps/web/src/components/audio-recorder.tsx` — same
 * `MediaRecorder` lifecycle, feature detection, and codec-negotiation logic
 * (ADR-0031: "reuse recorder semantics without rewriting codec
 * negotiation"), restyled with this app's plain CSS instead of Tailwind.
 *
 * Per the governing instruction, `MediaRecorder` in the Capacitor WebView
 * is used as-is for v1 rather than replaced with a native audio bridge —
 * that rewrite is only justified if physical-device testing later proves
 * this unreliable (see `docs/mobile/PHYSICAL_DEVICE_ACCEPTANCE.md`).
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
      <p role="alert" className="center">
        This app cannot record audio here. Check microphone permission in Settings.
      </p>
    );
  }

  if (supported === null) {
    return null;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
      {error !== null && (
        <p role="alert" className="center" style={{ color: 'var(--color-attention)' }}>
          {error}
        </p>
      )}

      {status === 'idle' && (
        <button
          type="button"
          onClick={() => void start()}
          aria-label="Start recording"
          className="record-button"
          style={{ background: 'var(--color-accent)' }}
        >
          <span
            style={{
              height: '3rem',
              width: '3rem',
              borderRadius: '50%',
              background: 'var(--color-accent-contrast)',
            }}
          />
        </button>
      )}

      {(status === 'recording' || status === 'paused') && (
        <>
          <div role="status" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span
              aria-hidden="true"
              style={{
                height: '0.75rem',
                width: '0.75rem',
                borderRadius: '50%',
                background:
                  status === 'recording' ? 'var(--color-attention)' : 'var(--color-ink-muted)',
              }}
            />
            <span style={{ fontFamily: 'monospace', fontSize: '1.5rem' }}>
              {formatElapsed(seconds)}
            </span>
            <span className="muted">{status === 'recording' ? 'Recording' : 'Paused'}</span>
          </div>

          <button
            type="button"
            onClick={stop}
            aria-label="Stop recording"
            className="record-button"
            style={{ background: 'var(--color-attention)' }}
          >
            <span
              style={{
                height: '2.5rem',
                width: '2.5rem',
                background: 'var(--color-accent-contrast)',
              }}
            />
          </button>

          <button
            type="button"
            onClick={status === 'recording' ? pause : resume}
            className="button-secondary"
          >
            {status === 'recording' ? 'Pause' : 'Resume'}
          </button>
        </>
      )}

      {status === 'stopped' && previewUrl !== null && (
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <p className="center muted">{formatElapsed(seconds)} recorded</p>
          <audio controls src={previewUrl} style={{ width: '100%' }} />
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button
              type="button"
              onClick={discard}
              disabled={submitting}
              className="button-secondary"
            >
              Discard &amp; retry
            </button>
            <button
              type="button"
              onClick={confirm}
              disabled={submitting}
              className="button-primary"
            >
              {submitting ? 'Submitting…' : submitLabel}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
