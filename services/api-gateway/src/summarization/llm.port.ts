/**
 * LlmPort — the integration boundary for local text generation (session
 * summaries, candidate outcome extraction), same reasoning as
 * `TranscriptionPort` (ADR-0007/ADR-0009): a Nest DI token as an abstract
 * class, one implementation, no cloud adapter behind it.
 *
 * One generic `complete` method rather than task-specific ones — summary
 * generation and candidate extraction are both "send a prompt, get text
 * back"; what differs is the prompt each caller builds, not this boundary.
 */

export interface LlmCompletionResult {
  readonly text: string;
  /** e.g. `'ollama:qwen2.5:1.5b'` — recorded as provenance by the caller. */
  readonly model: string;
}

export abstract class LlmPort {
  abstract complete(prompt: string): Promise<LlmCompletionResult>;
}
