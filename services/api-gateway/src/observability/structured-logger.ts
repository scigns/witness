/**
 * One JSON object per line, for deployed instances.
 *
 * Nest's default console logger is written for a human watching a terminal.
 * That is the wrong shape once logs are shipped somewhere: the timestamp, the
 * level and the context all end up inside one free-text string, so "every
 * error from the reports module in the last hour" becomes a regex problem.
 *
 * This is deliberately small. Witness does not need a logging framework; it
 * needs its existing `Logger` calls to come out machine-readable, and it needs
 * to be obvious — in about forty lines — that nothing here writes a request
 * body, a token or a connection string to disk.
 */

import type { LoggerService, LogLevel } from '@nestjs/common';

/** Fields attached to every line, so a log store can filter by deployment. */
export interface LoggerBaseFields {
  readonly service: string;
  readonly version: string;
  readonly buildId: string;
  readonly profile: string;
}

/** Nest's level names are for humans; these are the conventional severities. */
const SEVERITY: Record<LogLevel, string> = {
  fatal: 'fatal',
  error: 'error',
  warn: 'warn',
  log: 'info',
  debug: 'debug',
  verbose: 'trace',
};

export class StructuredLogger implements LoggerService {
  private readonly enabled: ReadonlySet<LogLevel>;

  constructor(
    levels: readonly LogLevel[],
    private readonly base: LoggerBaseFields,
  ) {
    this.enabled = new Set(levels);
  }

  log(message: unknown, ...rest: unknown[]): void {
    this.write('log', message, rest);
  }

  error(message: unknown, ...rest: unknown[]): void {
    this.write('error', message, rest);
  }

  warn(message: unknown, ...rest: unknown[]): void {
    this.write('warn', message, rest);
  }

  debug(message: unknown, ...rest: unknown[]): void {
    this.write('debug', message, rest);
  }

  verbose(message: unknown, ...rest: unknown[]): void {
    this.write('verbose', message, rest);
  }

  fatal(message: unknown, ...rest: unknown[]): void {
    this.write('fatal', message, rest);
  }

  /**
   * Nest passes the context as a trailing string argument and, for errors, a
   * stack as the argument before it. Anything else is rendered with
   * `String()` rather than serialised: a caller that hands the logger an
   * object it did not expect should produce a useless line, not a line that
   * quietly exfiltrates whatever the object happened to hold.
   */
  private write(level: LogLevel, message: unknown, rest: readonly unknown[]): void {
    if (!this.enabled.has(level)) return;

    const context = rest.length > 0 ? rest[rest.length - 1] : undefined;
    const stack = level === 'error' || level === 'fatal' ? rest[0] : undefined;

    const line = {
      timestamp: new Date().toISOString(),
      level: SEVERITY[level],
      message: typeof message === 'string' ? message : String(message),
      context: typeof context === 'string' ? context : undefined,
      stack: typeof stack === 'string' && stack !== context ? stack : undefined,
      ...this.base,
    };

    const stream = level === 'error' || level === 'fatal' ? process.stderr : process.stdout;
    stream.write(`${JSON.stringify(line)}\n`);
  }
}
