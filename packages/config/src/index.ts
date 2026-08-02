/**
 * @witness/config — environment validation and deployment profile enforcement.
 *
 * ADR-0013 makes the deployment profile a first-class architectural concept that
 * is validated at startup, and states that an inconsistent configuration **exits
 * the process** rather than starting in a state the operator misunderstands.
 * This module is that enforcement point.
 *
 * The rule that matters most: a `sovereign` instance with an external model
 * provider configured refuses to start. ADR-0009 is explicit that a
 * misconfiguration must not be able to silently become a data leak, and the only
 * way to guarantee that is to fail closed before the process accepts traffic.
 */

import { z } from 'zod';

export const DEPLOYMENT_PROFILES = ['sovereign', 'hybrid', 'development'] as const;
export type DeploymentProfile = (typeof DEPLOYMENT_PROFILES)[number];

/**
 * Thrown when configuration is invalid. Callers exit; they do not recover.
 *
 * The problems are composed into `message` as well as exposed on `problems`.
 * Anything that catches this will almost certainly log `error.message`, and a
 * summary with no detail — "Configuration is invalid" — sends an operator back
 * to guessing at 2am.
 */
export class ConfigurationError extends Error {
  public override readonly name = 'ConfigurationError';

  constructor(
    summary: string,
    public readonly problems: readonly string[],
  ) {
    super(
      problems.length > 0 ? `${summary}\n${problems.map((p) => `  • ${p}`).join('\n')}` : summary,
    );
  }
}

const booleanish = z
  .string()
  .optional()
  .transform((value) => value === 'true' || value === '1');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  WITNESS_DEPLOYMENT_PROFILE: z.enum(DEPLOYMENT_PROFILES).default('development'),
  WITNESS_INSTANCE_NAME: z.string().min(1).default('Witness'),
  WITNESS_DATA_RESIDENCY: z.string().min(1).default('not declared'),
  WITNESS_API_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  WITNESS_WEB_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  // Explicit override for deployments where the browser reaches the web app at
  // something other than localhost. Left empty, it is derived from the web port.
  WITNESS_WEB_ORIGIN: z.string().optional().default(''),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  // Egress-related. Empty is the sovereign default.
  EXTERNAL_MODEL_PROVIDER: z.string().optional().default(''),
  EXTERNAL_MODEL_API_KEY: z.string().optional().default(''),
  EXTERNAL_MODEL_BASE_URL: z.string().optional().default(''),
  ALLOW_EXTERNAL_MODEL_EGRESS: booleanish,

  TELEMETRY_EXTERNAL_REPORTING: booleanish,
});

export interface WitnessConfig {
  readonly nodeEnv: 'development' | 'test' | 'production';
  readonly profile: DeploymentProfile;
  readonly instanceName: string;
  readonly dataResidency: string;
  readonly apiPort: number;
  /**
   * The exact origin the browser will send. Used for CORS, so a mismatch means
   * every request from the web application is refused by the browser before it
   * reaches Witness at all — with an error that names CORS rather than the port
   * that was actually changed.
   */
  readonly webOrigin: string;
  readonly logLevel: 'debug' | 'info' | 'warn' | 'error';
  readonly databaseUrl: string;
  /** True only when the profile permits egress AND a provider is configured. */
  readonly externalInferenceEnabled: boolean;
  readonly externalModelProvider: string;
}

/**
 * Validate configuration, or throw with every problem found.
 *
 * Reports all problems at once. An operator fixing a misconfigured deployment at
 * 2am should get the full list, not discover the next one after each restart.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): WitnessConfig {
  const parsed = schema.safeParse(env);

  if (!parsed.success) {
    const problems = parsed.error.issues.map(
      (issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`,
    );
    throw new ConfigurationError('Configuration is invalid.', problems);
  }

  const value = parsed.data;
  const problems: string[] = [];

  const providerConfigured =
    value.EXTERNAL_MODEL_PROVIDER.trim() !== '' ||
    value.EXTERNAL_MODEL_BASE_URL.trim() !== '' ||
    value.EXTERNAL_MODEL_API_KEY.trim() !== '';

  // ── ADR-0009: the sovereign profile makes zero external calls ──────────────
  if (value.WITNESS_DEPLOYMENT_PROFILE === 'sovereign') {
    if (providerConfigured) {
      problems.push(
        'WITNESS_DEPLOYMENT_PROFILE=sovereign, but an external model provider is configured ' +
          '(EXTERNAL_MODEL_PROVIDER / EXTERNAL_MODEL_BASE_URL / EXTERNAL_MODEL_API_KEY). ' +
          'The sovereign profile makes zero external calls by definition (ADR-0009, principle P1). ' +
          'Either clear these values or set the profile to `hybrid` — deliberately, and knowing ' +
          'that institutional deliberation will leave your network boundary.',
      );
    }

    if (value.ALLOW_EXTERNAL_MODEL_EGRESS) {
      problems.push(
        'WITNESS_DEPLOYMENT_PROFILE=sovereign, but ALLOW_EXTERNAL_MODEL_EGRESS is true. ' +
          'These cannot both be correct.',
      );
    }

    if (value.TELEMETRY_EXTERNAL_REPORTING) {
      problems.push(
        'WITNESS_DEPLOYMENT_PROFILE=sovereign, but TELEMETRY_EXTERNAL_REPORTING is true. ' +
          'Telemetry egress is egress (ADR-0014).',
      );
    }
  }

  // ── ADR-0013: the development profile is refused in production ─────────────
  if (value.WITNESS_DEPLOYMENT_PROFILE === 'development' && value.NODE_ENV === 'production') {
    problems.push(
      'WITNESS_DEPLOYMENT_PROFILE=development with NODE_ENV=production. The development ' +
        'profile enables conveniences that must never run in production, including the ' +
        'development authorisation adapter. Set the profile to `sovereign` or `hybrid`.',
    );
  }

  // ── Hybrid must be deliberate, not accidental ──────────────────────────────
  if (
    value.WITNESS_DEPLOYMENT_PROFILE === 'hybrid' &&
    providerConfigured &&
    !value.ALLOW_EXTERNAL_MODEL_EGRESS
  ) {
    problems.push(
      'WITNESS_DEPLOYMENT_PROFILE=hybrid with a provider configured but ' +
        'ALLOW_EXTERNAL_MODEL_EGRESS=false. Egress requires an explicit opt-in as well as a ' +
        'permitting profile; refusing to guess which you meant.',
    );
  }

  if (problems.length > 0) {
    throw new ConfigurationError(
      'Configuration violates the deployment profile contract.',
      problems,
    );
  }

  return {
    nodeEnv: value.NODE_ENV,
    profile: value.WITNESS_DEPLOYMENT_PROFILE,
    instanceName: value.WITNESS_INSTANCE_NAME,
    dataResidency: value.WITNESS_DATA_RESIDENCY,
    apiPort: value.WITNESS_API_PORT,
    webOrigin:
      value.WITNESS_WEB_ORIGIN.trim() !== ''
        ? value.WITNESS_WEB_ORIGIN.trim()
        : `http://localhost:${value.WITNESS_WEB_PORT}`,
    logLevel: value.LOG_LEVEL,
    databaseUrl: value.DATABASE_URL,
    externalInferenceEnabled:
      value.WITNESS_DEPLOYMENT_PROFILE !== 'sovereign' &&
      providerConfigured &&
      value.ALLOW_EXTERNAL_MODEL_EGRESS,
    externalModelProvider: value.EXTERNAL_MODEL_PROVIDER,
  };
}

/**
 * Load configuration or terminate the process.
 *
 * ADR-0013 says an inconsistent configuration exits rather than starting in a
 * state the operator misunderstands. Starting anyway with a warning is how a
 * sovereignty guarantee quietly becomes a sovereignty aspiration.
 */
export function loadConfigOrExit(env: NodeJS.ProcessEnv = process.env): WitnessConfig {
  try {
    return loadConfig(env);
  } catch (error) {
    if (error instanceof ConfigurationError) {
      process.stderr.write(`\n${error.message}\n`);
      process.stderr.write('\nRefusing to start. See .env.example and ADR-0013.\n\n');
      process.exit(78); // EX_CONFIG
    }
    throw error;
  }
}

/** Values safe to expose over the network. Never add a secret to this. */
export function publicConfig(config: WitnessConfig): Record<string, string | boolean> {
  return {
    instanceName: config.instanceName,
    profile: config.profile,
    dataResidency: config.dataResidency,
    externalInferenceEnabled: config.externalInferenceEnabled,
  };
}
