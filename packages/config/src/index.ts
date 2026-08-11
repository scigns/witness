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
  // Where the web application actually lives, when that is not the root of its
  // origin. Witness is served at `/witness` on a domain whose `/` belongs to
  // something else, and the API has to send a signed-in browser back to the
  // application rather than to that something else. Empty means "the root",
  // which is what a dedicated hostname gives you.
  WITNESS_WEB_BASE_URL: z.string().optional().default(''),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  // ── OIDC / Keycloak (ADR-0007) ─────────────────────────────────────────────
  // Names match the ones already scaffolded in .env.example — reused rather than
  // reinvented. Empty is valid only in the development profile (validated below);
  // every other profile refuses to start without real identity-provider config.
  OIDC_ISSUER: z.string().optional().default(''),
  KEYCLOAK_CLIENT_ID: z.string().optional().default(''),
  KEYCLOAK_CLIENT_SECRET: z.string().optional().default(''),
  JWT_AUDIENCE: z.string().optional().default(''),
  // Where Keycloak redirects back to after sign-in. Derived from the API port
  // when empty, same pattern as WITNESS_WEB_ORIGIN below.
  WITNESS_OIDC_REDIRECT_URI: z.string().optional().default(''),
  WITNESS_SESSION_TTL_MINUTES: z.coerce.number().int().min(1).default(480),

  // Evidence attachments are stored as bytes in Postgres (ADR-0011: the
  // database is the whole system of record, so `scripts/ops/backup.sh`
  // backs them up for free — no second, unbacked-up volume to lose). This
  // caps a single upload; multer enforces it before the bytes reach the
  // database at all.
  WITNESS_MAX_EVIDENCE_ATTACHMENT_MB: z.coerce.number().int().min(1).default(200),

  // Local text generation (session summaries, candidate outcome extraction —
  // Phases 4-5), served by the `ollama` sidecar over the compose network.
  // Not `EXTERNAL_MODEL_*`: that family is specifically the sovereign-profile
  // egress gate (see the ADR-0009 block below), and a same-network sidecar
  // with no route out of this deployment is not what that gate is for.
  WITNESS_LOCAL_LLM_URL: z.string().optional().default('http://ollama:11434'),
  WITNESS_LOCAL_LLM_MODEL: z.string().optional().default('qwen2.5:1.5b'),

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
  /**
   * The web application's base URL, always with a trailing slash so that
   * `new URL('auth/callback', webBaseUrl)` resolves *under* it. Without the
   * slash, `new URL` replaces the last path segment and the callback lands on
   * whatever else is served at that origin.
   *
   * Same origin as `webOrigin`, enforced at load: these are the only redirect
   * targets `AuthenticationController` produces, and that file's promise that
   * it cannot be used as an open redirect rests on it.
   */
  readonly webBaseUrl: string;
  readonly logLevel: 'debug' | 'info' | 'warn' | 'error';
  readonly databaseUrl: string;
  /** True only when the profile permits egress AND a provider is configured. */
  readonly externalInferenceEnabled: boolean;
  readonly externalModelProvider: string;

  /** Empty in the development profile — validated non-empty everywhere else. */
  readonly oidcIssuer: string;
  readonly oidcClientId: string;
  /** Empty for a public PKCE-only client; set for a confidential client. */
  readonly oidcClientSecret: string;
  readonly jwtAudience: string;
  readonly oidcRedirectUri: string;
  readonly sessionTtlMinutes: number;
  readonly maxEvidenceAttachmentMb: number;
  readonly localLlmUrl: string;
  readonly localLlmModel: string;
}

/**
 * Hostnames that only ever mean "this machine". A deployed instance that names
 * one of these has been handed a developer's configuration.
 */
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1', '0.0.0.0']);

/**
 * Check one URL that a browser or an identity provider has to reach.
 *
 * Returns every problem rather than the first, matching `loadConfig`'s promise
 * that an operator gets the whole list in one restart.
 */
function deployedUrlProblems(
  name: string,
  raw: string,
  options: { readonly requirement?: string; readonly skipWhenEmpty?: boolean } = {},
): string[] {
  const value = raw.trim();

  if (value === '') {
    // OIDC_ISSUER's emptiness is already reported, with a better message, by the
    // identity check above. Reporting it twice would just be noise.
    return options.skipWhenEmpty === true
      ? []
      : [
          `${name} must be set explicitly outside the development profile — ` +
            `${options.requirement ?? 'it has no safe default for a deployed instance'}.`,
        ];
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return [`${name} is not a valid absolute URL: ${value}`];
  }

  const problems: string[] = [];

  if (url.protocol !== 'https:') {
    problems.push(
      `${name} must use https outside the development profile (got ${url.protocol.replace(':', '')}). ` +
        'Session tokens and authorization codes travel over these URLs.',
    );
  }

  if (LOOPBACK_HOSTS.has(url.hostname.toLowerCase())) {
    problems.push(
      `${name} points at ${url.hostname}, which is only reachable from the machine running ` +
        'Witness. Set it to the address the browser actually uses.',
    );
  }

  return problems;
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

  // ── ADR-0007: real identity is required outside development ────────────────
  // The development profile is the only one permitted to run without a real
  // identity provider (KeycloakOidcAdapter's development-only double stands in).
  // Every other profile fails closed here, before the process accepts traffic —
  // the same "refuse to start rather than serve requests with no identity"
  // posture ADR-0013 already applies to the deployment-profile contract itself.
  if (value.WITNESS_DEPLOYMENT_PROFILE !== 'development') {
    if (value.OIDC_ISSUER.trim() === '') {
      problems.push(
        `WITNESS_DEPLOYMENT_PROFILE=${value.WITNESS_DEPLOYMENT_PROFILE} requires OIDC_ISSUER ` +
          '(the Keycloak realm issuer URL) — real authentication cannot start without it.',
      );
    }
    if (value.KEYCLOAK_CLIENT_ID.trim() === '') {
      problems.push(
        `WITNESS_DEPLOYMENT_PROFILE=${value.WITNESS_DEPLOYMENT_PROFILE} requires ` +
          'KEYCLOAK_CLIENT_ID.',
      );
    }
    if (value.JWT_AUDIENCE.trim() === '') {
      problems.push(
        `WITNESS_DEPLOYMENT_PROFILE=${value.WITNESS_DEPLOYMENT_PROFILE} requires JWT_AUDIENCE ` +
          '— ID tokens are refused unless their audience is checked against a known value.',
      );
    }
  }

  // ── Deployed instances must be told their real public addresses ────────────
  // `webOrigin` and `oidcRedirectUri` both fall back to a localhost URL derived
  // from a port. That default is right for a developer and catastrophic for a
  // deployment: CORS would refuse every request from the real frontend, and the
  // OIDC callback would send an authenticated user's authorization code to a
  // host that is not the API. Both failures surface as something else — a CORS
  // error, an "invalid redirect_uri" from Keycloak — so outside development the
  // values are required, and required to be the addresses a browser can
  // actually reach over TLS.
  if (value.WITNESS_DEPLOYMENT_PROFILE !== 'development') {
    problems.push(
      ...deployedUrlProblems('WITNESS_WEB_ORIGIN', value.WITNESS_WEB_ORIGIN, {
        requirement:
          'the exact origin the browser sends, used for the CORS policy — the localhost ' +
          'default derived from WITNESS_WEB_PORT is never correct for a deployed instance',
      }),
      ...deployedUrlProblems('WITNESS_OIDC_REDIRECT_URI', value.WITNESS_OIDC_REDIRECT_URI, {
        requirement:
          'where the identity provider returns the authorization code — it must match the ' +
          'redirect URI registered on the Keycloak client',
      }),
      ...deployedUrlProblems('OIDC_ISSUER', value.OIDC_ISSUER, { skipWhenEmpty: true }),
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

  const webOrigin =
    value.WITNESS_WEB_ORIGIN.trim() !== ''
      ? value.WITNESS_WEB_ORIGIN.trim()
      : `http://localhost:${value.WITNESS_WEB_PORT}`;

  const webBaseUrl = (() => {
    const raw = value.WITNESS_WEB_BASE_URL.trim();
    if (raw === '') return `${webOrigin.replace(/\/$/, '')}/`;

    let parsed: URL;
    try {
      parsed = new URL(raw);
    } catch {
      problems.push(`WITNESS_WEB_BASE_URL is not a valid absolute URL: ${raw}`);
      return `${webOrigin.replace(/\/$/, '')}/`;
    }

    // A base URL on a different origin would turn the OIDC callback into an
    // open redirect carrying a live session token in its fragment.
    if (parsed.origin !== new URL(webOrigin).origin) {
      problems.push(
        `WITNESS_WEB_BASE_URL (${parsed.origin}) is on a different origin from ` +
          `WITNESS_WEB_ORIGIN (${webOrigin}). The callback redirect must stay on the ` +
          'origin the CORS policy admits.',
      );
    }

    return parsed.pathname.endsWith('/') ? parsed.toString() : `${parsed.toString()}/`;
  })();

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
    webOrigin,
    webBaseUrl,
    logLevel: value.LOG_LEVEL,
    databaseUrl: value.DATABASE_URL,
    externalInferenceEnabled:
      value.WITNESS_DEPLOYMENT_PROFILE !== 'sovereign' &&
      providerConfigured &&
      value.ALLOW_EXTERNAL_MODEL_EGRESS,
    externalModelProvider: value.EXTERNAL_MODEL_PROVIDER,
    oidcIssuer: value.OIDC_ISSUER.trim(),
    oidcClientId: value.KEYCLOAK_CLIENT_ID.trim(),
    oidcClientSecret: value.KEYCLOAK_CLIENT_SECRET.trim(),
    jwtAudience: value.JWT_AUDIENCE.trim(),
    oidcRedirectUri:
      value.WITNESS_OIDC_REDIRECT_URI.trim() !== ''
        ? value.WITNESS_OIDC_REDIRECT_URI.trim()
        : `http://localhost:${value.WITNESS_API_PORT}/api/v1/auth/callback`,
    sessionTtlMinutes: value.WITNESS_SESSION_TTL_MINUTES,
    maxEvidenceAttachmentMb: value.WITNESS_MAX_EVIDENCE_ATTACHMENT_MB,
    localLlmUrl: value.WITNESS_LOCAL_LLM_URL,
    localLlmModel: value.WITNESS_LOCAL_LLM_MODEL,
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
