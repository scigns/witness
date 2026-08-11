/**
 * LocalWhisperAdapter — speech-to-text via a whisper.cpp binary and model
 * baked into this image at build time (see `services/api-gateway/Dockerfile`'s
 * `whisper` stage). Everything here runs as a local subprocess; nothing it
 * does reaches the network, which is what lets it run in the `sovereign`
 * profile at all (ADR-0009).
 *
 * Two subprocesses per transcription:
 *   1. `ffmpeg` — whisper.cpp only accepts 16kHz mono 16-bit PCM WAV, and
 *      evidence attachments arrive in whatever format a browser recorded
 *      (`evidence-attachment.ts`'s `ALLOWED_CONTENT_TYPES`). ffmpeg is the
 *      one well-understood way to get from "any of those" to that, without
 *      writing a decoder for each container/codec by hand.
 *   2. `whisper-cli` — runs inference against the transcoded WAV and writes
 *      JSON (`-oj`) with per-segment text and millisecond offsets.
 *
 * All work happens in a per-call temporary directory, removed in a `finally`
 * whether transcription succeeds or fails — a failed transcription must not
 * leak a partially-written audio file onto disk.
 */

import { Injectable, Logger } from '@nestjs/common';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { TranscriptionPort, type TranscriptionResult } from './transcription.port.js';

const execFileAsync = promisify(execFile);

const WHISPER_BIN = process.env['WITNESS_WHISPER_BIN'] ?? '/usr/local/bin/whisper-cli';
const WHISPER_MODEL_PATH =
  process.env['WITNESS_WHISPER_MODEL_PATH'] ?? '/opt/whisper/ggml-base.bin';
const WHISPER_MODEL_NAME = process.env['WITNESS_WHISPER_MODEL'] ?? 'base';

/** Generous — a full session recording is minutes long; CPU inference is not instant. */
const TRANSCRIBE_TIMEOUT_MS = 30 * 60 * 1000;

interface WhisperCliJson {
  result?: { language?: string };
  transcription?: {
    text: string;
    offsets?: { from: number; to: number };
  }[];
}

@Injectable()
export class LocalWhisperAdapter extends TranscriptionPort {
  private readonly logger = new Logger(LocalWhisperAdapter.name);

  async transcribe(audio: Buffer, _contentType: string): Promise<TranscriptionResult> {
    const dir = await mkdtemp(join(tmpdir(), 'witness-transcribe-'));
    const inputPath = join(dir, 'input');
    const wavPath = join(dir, 'audio.wav');
    const outputPrefix = join(dir, 'output');

    try {
      await writeFile(inputPath, audio);

      // ffmpeg sniffs the container from the bytes themselves, not the file
      // extension, so an extensionless input file is fine here.
      try {
        await execFileAsync(
          'ffmpeg',
          ['-y', '-i', inputPath, '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', wavPath],
          { timeout: TRANSCRIBE_TIMEOUT_MS },
        );
      } catch (error) {
        // execFile's rejection message is "Command failed: <cmd>" followed by
        // ffmpeg's full stderr — which opens with a multi-line build-config
        // banner (compiler flags, every linked library and its version)
        // before ever getting to the one line a reader needs, and
        // `failTranscription`'s 2000-char cap on the stored reason is easily
        // consumed by that banner alone. The facilitator reading this failure
        // needs "this file isn't usable audio", not ffmpeg's configure
        // invocation, so the raw detail is logged here and a clean message
        // takes its place in what gets stored and shown.
        this.logger.error(
          `ffmpeg transcode failed: ${error instanceof Error ? error.message : String(error)}`,
        );
        throw new Error(
          'This recording could not be processed as audio. It may be corrupted, empty, or in a format ffmpeg cannot decode.',
        );
      }

      try {
        await execFileAsync(
          WHISPER_BIN,
          ['-m', WHISPER_MODEL_PATH, '-f', wavPath, '-l', 'auto', '-oj', '-of', outputPrefix],
          { timeout: TRANSCRIBE_TIMEOUT_MS, maxBuffer: 1024 * 1024 * 64 },
        );
      } catch (error) {
        this.logger.error(
          `whisper-cli failed: ${error instanceof Error ? error.message : String(error)}`,
        );
        throw new Error('Local speech recognition failed while processing this recording.');
      }

      const raw = await readFile(`${outputPrefix}.json`, 'utf8');
      const parsed = JSON.parse(raw) as WhisperCliJson;
      const segments = (parsed.transcription ?? []).map((segment) => ({
        text: segment.text.trim(),
        startMs: segment.offsets?.from ?? null,
        endMs: segment.offsets?.to ?? null,
      }));

      return {
        text: segments
          .map((s) => s.text)
          .join(' ')
          .trim(),
        segments,
        model: `whisper.cpp:${WHISPER_MODEL_NAME}`,
        language: parsed.result?.language ?? null,
      };
    } catch (error) {
      this.logger.error(
        `Local transcription failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
}
