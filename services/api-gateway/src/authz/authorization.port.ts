/**
 * AuthorizationPort — the integration boundary for ADR-0007.
 *
 * ADR-0007 specifies Keycloak as the identity provider and Casbin as a single
 * policy decision point composing RBAC, ABAC and ReBAC, with **absence of an
 * explicit allow treated as a deny**.
 *
 * Neither Keycloak nor Casbin is wired up in the Developer Preview. That is
 * Phase 2 (roadmap 2.5 and 2.6). What exists here is the *port* — the interface
 * every call site already depends on — so that landing the real adapter is a new
 * file and a provider binding, not a refactor of every controller.
 *
 * This is a deliberate boundary, not a stub standing in for the real thing. The
 * distinction matters: `DevelopmentAuthorizationAdapter` refuses to load outside
 * the development profile, so there is no configuration in which the preview's
 * permissive behaviour can reach production.
 */

export interface Principal {
  /** Subject identifier. From the OIDC `sub` claim once Keycloak is wired up. */
  readonly subject: string;
  readonly displayName: string;
  /** `human` for a person; a service account authenticates as `system`. */
  readonly kind: 'human' | 'system';
  readonly roles: readonly string[];
}

export type Action =
  | 'record:read'
  | 'record:create'
  | 'record:review'
  | 'organisation:read'
  | 'organisation:create'
  | 'workspace:read'
  | 'workspace:create';

export interface AuthorizationDecision {
  readonly allowed: boolean;
  /** Why. Surfaced in logs and in the 403 body — an opaque denial is unfixable. */
  readonly reason: string;
}

export abstract class AuthorizationPort {
  /**
   * Decide whether `principal` may perform `action`.
   *
   * Implementations MUST deny by default. A decision this method cannot make is
   * a denial, never an allow.
   */
  abstract decide(principal: Principal, action: Action): Promise<AuthorizationDecision>;

  /** Resolve the principal for a request. Returns null when unauthenticated. */
  abstract authenticate(authorizationHeader: string | undefined): Promise<Principal | null>;
}
