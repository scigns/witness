/**
 * TranscriptionPort — the integration boundary for speech-to-text, same
 * reasoning as `IdentityProviderPort` (ADR-0007): a Nest DI token as an
 * abstract class, because an `interface` does not survive compilation and
 * cannot be injected against.
 *
 * `LocalWhisperAdapter` is the only implementation this milestone ships —
 * ADR-0009 forbids the `sovereign` profile from making any external call for
 * institutional content, and audio evidence is exactly that. There is
 * deliberately no cloud-provider adapter behind this port: adding one later
 * is an adapter change, not a rewrite, but it is not this milestone's job to
 * pre-build the seam for a capability nobody has asked for.
 */

export interface TranscriptionSegmentResult {
  readonly text: string;
  readonly startMs: number | null;
  readonly endMs: number | null;
}

export interface TranscriptionResult {
  readonly text: string;
  readonly segments: readonly TranscriptionSegmentResult[];
  /** e.g. `'whisper.cpp:base'` — recorded on the `Transcript` as provenance. */
  readonly model: string;
  readonly language: string | null;
}

export abstract class TranscriptionPort {
  abstract transcribe(audio: Buffer, contentType: string): Promise<TranscriptionResult>;
}
