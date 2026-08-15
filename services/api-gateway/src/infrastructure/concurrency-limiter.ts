/**
 * Caps how many local-inference jobs (whisper.cpp transcription, Ollama
 * summarisation/candidate extraction) run at once, sharing this node's CPU.
 *
 * This is a single-node deployment (ADR-0013) with no worker pool — every
 * job the three call sites below start (`TranscriptService.runTranscription`,
 * `SessionSummaryService.runSummary`, `OutcomeCandidateService.run`) runs as
 * an unawaited async call in this same process, competing for the same CPU.
 * Without a cap, several recordings uploaded back to back spawn that many
 * concurrent whisper-cli subprocess trees at once, degrading every in-flight
 * job's latency together rather than queuing politely. `run()` is FIFO: a
 * caller past the limit waits for the oldest still-running slot to free, not
 * for the whole limiter to drain.
 */

export class ConcurrencyLimiter {
  private active = 0;
  private readonly waiters: (() => void)[] = [];

  constructor(private readonly limit: number) {}

  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active >= this.limit) {
      await new Promise<void>((resolve) => this.waiters.push(resolve));
    }
    this.active++;

    try {
      return await fn();
    } finally {
      this.active--;
      const next = this.waiters.shift();
      if (next !== undefined) next();
    }
  }
}
