/**
 * Witness API — entry point.
 *
 * Order matters here. Configuration is validated before the Nest application is
 * created, so an instance whose configuration violates the deployment-profile
 * contract exits without ever binding a port (ADR-0013). A server that starts
 * and then logs a warning is how a sovereignty guarantee becomes a sovereignty
 * aspiration.
 */

import 'reflect-metadata';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';

import { loadConfigOrExit } from '@witness/config';

import { AppModule } from './app.module.js';
import { BUILD_INFO } from './build-info.js';
import { StructuredLogger } from './observability/structured-logger.js';

async function bootstrap(): Promise<void> {
  const config = loadConfigOrExit();

  const levels =
    config.logLevel === 'debug'
      ? (['error', 'warn', 'log', 'debug'] as const)
      : config.logLevel === 'info'
        ? (['error', 'warn', 'log'] as const)
        : ([config.logLevel] as const);

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    // Deployed instances emit one JSON object per line, because that is what a
    // log aggregator can query and what an operator can grep six weeks later.
    // Development keeps Nest's coloured console output, which is easier to read
    // while a human is watching it scroll.
    logger:
      config.profile === 'development'
        ? [...levels]
        : new StructuredLogger([...levels], {
            service: 'witness-api',
            version: BUILD_INFO.version,
            buildId: BUILD_INFO.buildId,
            profile: config.profile,
          }),
  });

  const logger = new Logger('Bootstrap');

  // No global ValidationPipe. Request bodies are validated with zod schemas from
  // @witness/contracts at each controller, so the same schema that defines the
  // contract is the one that enforces it. class-validator DTOs would be a second,
  // parallel definition of the same shape — and two definitions of one contract
  // drift.

  // The browser calls the API directly from a different origin in development.
  // Narrow, explicit, and never `*` — a permissive CORS policy left in place is
  // one of the most common ways an internal API becomes a public one.
  //
  // `credentials: false` remains correct even with real sessions (Milestone
  // 1.3): the session token travels as an `Authorization: Bearer` header, set
  // explicitly by the frontend after the OIDC callback, never as a cookie —
  // see `schema.prisma`'s `AuthSession` model for why a cross-origin cookie
  // was rejected. `credentials: true` would be needed only if a cookie were
  // in play; it is not, so it stays off.
  app.enableCors({
    origin: config.webOrigin,
    credentials: false,
    // The development impersonation header is allowed only where an adapter
    // exists to read it. Outside development it is already inert — nothing is
    // bound that would honour it — but advertising it in
    // `Access-Control-Allow-Headers` on a deployed instance invites someone to
    // spend an afternoon establishing that.
    allowedHeaders:
      config.profile === 'development'
        ? ['Content-Type', 'X-Witness-Dev-User', 'Authorization']
        : ['Content-Type', 'Authorization'],
  });

  // Behind the pilot's TLS terminator, every connection Express sees arrives
  // over loopback HTTP. Without this, `req.protocol` reports `http` and
  // `req.ip` is the proxy — which turns audit and access logs into a record of
  // the proxy talking to itself.
  if (config.profile !== 'development') {
    app.set('trust proxy', 'loopback');
  }

  app.enableShutdownHooks();

  await app.listen(config.apiPort, '0.0.0.0');

  logger.log(
    `Witness API ${BUILD_INFO.version} (${BUILD_INFO.buildId}) — ${BUILD_INFO.releaseName}`,
  );
  logger.log(`Profile: ${config.profile} · Data residency: ${config.dataResidency}`);
  logger.log(`Listening on http://localhost:${config.apiPort}`);
  logger.log(`Accepting browser requests from ${config.webOrigin}`);

  if (config.profile === 'development') {
    logger.warn(
      'Development profile: requests are NOT authenticated. Do not expose beyond localhost.',
    );
  }
}

bootstrap().catch((error: unknown) => {
  process.stderr.write(
    `Failed to start: ${error instanceof Error ? error.stack : String(error)}\n`,
  );
  process.exit(1);
});
