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

import { loadConfigOrExit } from '@witness/config';

import { AppModule } from './app.module.js';
import { BUILD_INFO } from './build-info.js';

async function bootstrap(): Promise<void> {
  const config = loadConfigOrExit();
  const logger = new Logger('Bootstrap');

  const app = await NestFactory.create(AppModule, {
    logger:
      config.logLevel === 'debug'
        ? ['error', 'warn', 'log', 'debug']
        : config.logLevel === 'info'
          ? ['error', 'warn', 'log']
          : [config.logLevel],
  });

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
    allowedHeaders: ['Content-Type', 'X-Witness-Dev-User', 'Authorization'],
  });

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
