/**
 * Prisma client lifecycle.
 *
 * An adapter, in ADR-0003 terms. Nothing above this layer imports Prisma types —
 * services depend on repository interfaces, so replacing Prisma means rewriting
 * this directory and nothing else.
 */

import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      // Query logging is off by default. Queries carry parameter values, and
      // parameter values here are the words people said in a meeting. Logging
      // them would leak content into a log stream retained under a different
      // policy than the content itself.
      log: [
        { emit: 'event', level: 'warn' },
        { emit: 'event', level: 'error' },
      ],
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Connected to PostgreSQL');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /** Liveness probe for the health endpoint. Returns round-trip milliseconds. */
  async ping(): Promise<number> {
    const started = Date.now();
    await this.$queryRaw`SELECT 1`;
    return Date.now() - started;
  }
}
