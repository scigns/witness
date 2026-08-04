/**
 * The single Casbin policy decision point (ADR-0007) — role tier → action
 * grants, loaded once from the versioned policy data in `packages/policy/`
 * (`model.conf`, `policy.csv`), never from application code. Domain scoping
 * (which organisation or workspace a role applies to) is resolved before
 * this class is ever consulted — see `role-resolution.ts` and
 * `policy-enforcement.service.ts` — this class only answers "does this tier
 * grant this action", the one question that genuinely does not vary by
 * tenant.
 *
 * `Enforcer` is instantiated once at construction and reused for every
 * check for the lifetime of the process. Policy data changes require a
 * restart to take effect — an accepted trade for a file-backed policy store
 * (ADR-0007 accepts "cache-invalidation complexity" for an in-process PDP;
 * a static, versioned file is the simplest point on that trade-off curve,
 * and policy changes here are a reviewed code change, not a runtime
 * administrative action).
 */

import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { newEnforcer, type Enforcer } from 'casbin';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// From services/api-gateway/{src,dist}/authz/ up to the repository root,
// then into the versioned policy package — true whether running the
// compiled dist/ output or (via tsx) the src/ tree directly, since both
// sit at the same depth under services/api-gateway.
const POLICY_DIR = join(__dirname, '..', '..', '..', '..', 'packages', 'policy');

export const CASBIN_MODEL_PATH = join(POLICY_DIR, 'model.conf');
export const CASBIN_POLICY_PATH = join(POLICY_DIR, 'policy.csv');

@Injectable()
export class PolicyEngineService implements OnModuleInit {
  private readonly logger = new Logger(PolicyEngineService.name);
  private enforcer: Enforcer | null = null;
  private ready: Promise<Enforcer> | null = null;

  async onModuleInit(): Promise<void> {
    // Fail loudly at startup, not on the first request — matches
    // `KeycloakOidcAdapter`'s and the config loader's "refuse to start
    // rather than serve requests with a broken dependency" posture.
    await this.load();
  }

  private load(): Promise<Enforcer> {
    if (this.ready === null) {
      this.ready = newEnforcer(CASBIN_MODEL_PATH, CASBIN_POLICY_PATH)
        .then((enforcer) => {
          this.enforcer = enforcer;
          return enforcer;
        })
        .catch((error: unknown) => {
          this.ready = null;
          this.logger.error(
            `Failed to load Casbin policy from ${CASBIN_POLICY_PATH}: ` +
              (error instanceof Error ? error.message : String(error)),
          );
          throw error;
        });
    }
    return this.ready;
  }

  /**
   * Does `tier` grant `action`? Fails closed: if the policy engine itself
   * cannot be loaded, this rejects rather than resolving `false` silently —
   * the caller (`PolicyEnforcementService`) must treat a thrown error as a
   * denial, never as "no policy, so allow".
   */
  async grants(tier: string, action: string): Promise<boolean> {
    const enforcer = this.enforcer ?? (await this.load());
    return enforcer.enforce(tier, action);
  }
}
