/**
 * "Raw tokens absent from application logs" (Witness Participate mobile
 * programme, security adversarial suite) — proven statically here rather
 * than by capturing real log output, because the honest current state is
 * that none of these four files log anything at all. Reading the source is
 * a stronger, more durable guarantee than grepping captured output for a
 * token value: it also catches a *future* logging call that references a
 * token variable, before it ships, rather than only after a real capture
 * or join token has already appeared in a real log line somewhere.
 *
 * If one of these files ever legitimately needs a log line, this test
 * forces whoever adds it to prove — right here — that the line does not
 * interpolate a token, rather than that omission being merely conventional.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const HERE = dirname(fileURLToPath(import.meta.url));

const FILES_THAT_HANDLE_RAW_TOKENS = [
  'session-join.controller.ts',
  'session-join.service.ts',
  'participant-capture.controller.ts',
  'participant-capture.service.ts',
];

const LOG_CALL_SOURCE = '\\b(console\\.\\w+|logger\\.\\w+|this\\.logger\\.\\w+)\\s*\\(';
const TOKEN_VARIABLE_PATTERN = /token/i;

describe('participant/join token handling — never logged', () => {
  it.each(FILES_THAT_HANDLE_RAW_TOKENS)(
    '%s contains no logging call that references a token',
    (filename) => {
      const source = readFileSync(join(HERE, filename), 'utf8');
      // A fresh RegExp per call — a shared global-flag instance would carry
      // `lastIndex` state across the different files this runs against.
      const logCalls = source.match(new RegExp(LOG_CALL_SOURCE, 'gi')) ?? [];

      for (const call of logCalls) {
        const callStart = source.indexOf(call);
        // The argument list of the call — up to its closing paren on the same
        // logical statement is good enough here: a token reference spanning
        // multiple lines inside a log call would be unusual enough to warrant
        // manual review anyway, and this still catches the common case (a
        // template literal or a direct variable reference as one of the
        // call's arguments).
        const argsSnippet = source.slice(callStart, callStart + 300);
        expect(
          TOKEN_VARIABLE_PATTERN.test(argsSnippet),
          `${filename}: a logging call appears to reference a token — logging call: ${JSON.stringify(argsSnippet)}`,
        ).toBe(false);
      }
    },
  );

  it('confirms the current, honest state: these files log nothing at all', () => {
    for (const filename of FILES_THAT_HANDLE_RAW_TOKENS) {
      const source = readFileSync(join(HERE, filename), 'utf8');
      expect(
        new RegExp(LOG_CALL_SOURCE, 'i').test(source),
        `${filename} now logs — update this suite's review accordingly`,
      ).toBe(false);
    }
  });
});
