/**
 * OllamaLlmAdapter — text generation via an Ollama server on the compose
 * network (`WITNESS_LOCAL_LLM_URL`, default `http://ollama:11434`). Never a
 * public address: the `ollama` service in `docker-compose.pilot.yml`
 * publishes no port, so this is a local, same-network call, not egress —
 * the ADR-0009 boundary `LlmPort`'s file header describes.
 *
 * The model itself is pulled once, by the `ollama` service's own start
 * command, into a named volume — the same "network access at provisioning
 * time only" shape as `LocalWhisperAdapter`'s model, just deferred to first
 * container start instead of image build, because Ollama's own image has no
 * "bake a model in" step of its own.
 */

import { Injectable, Inject, Logger } from '@nestjs/common';

import type { WitnessConfig } from '@witness/config';

import { WITNESS_CONFIG } from '../tokens.js';
import { LlmPort, type LlmCompletionResult } from './llm.port.js';

/** Generous — CPU inference of a few hundred output tokens is not instant. */
const COMPLETION_TIMEOUT_MS = 5 * 60 * 1000;

interface OllamaGenerateResponse {
  response?: string;
}

@Injectable()
export class OllamaLlmAdapter extends LlmPort {
  private readonly logger = new Logger(OllamaLlmAdapter.name);

  constructor(@Inject(WITNESS_CONFIG) private readonly config: WitnessConfig) {
    super();
  }

  async complete(prompt: string): Promise<LlmCompletionResult> {
    let response: Response;

    try {
      response = await fetch(`${this.config.localLlmUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: this.config.localLlmModel, prompt, stream: false }),
        signal: AbortSignal.timeout(COMPLETION_TIMEOUT_MS),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Local LLM unreachable at ${this.config.localLlmUrl}: ${message}`);
      throw new Error(`Local LLM unreachable: ${message}`);
    }

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(
        `Local LLM request failed with status ${response.status}: ${body.slice(0, 500)}`,
      );
    }

    const data = (await response.json()) as OllamaGenerateResponse;
    const text = (data.response ?? '').trim();

    if (text === '') {
      throw new Error('Local LLM returned an empty response.');
    }

    return { text, model: `ollama:${this.config.localLlmModel}` };
  }
}
