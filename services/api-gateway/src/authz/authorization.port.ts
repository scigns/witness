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
  | 'workspace:create'
  | 'workspace:update'
  | 'user:read'
  | 'user:create'
  | 'organisation_membership:read'
  | 'organisation_membership:create'
  | 'organisation_membership:update'
  | 'workspace_membership:read'
  | 'workspace_membership:create'
  | 'workspace_membership:update'
  | 'role:read'
  | 'role_assignment:read'
  | 'role_assignment:write'
  | 'role_assignment:delete'
  | 'session:read'
  | 'session:create'
  | 'session:update'
  | 'session:transition'
  | 'participant:read'
  | 'participant:create'
  | 'participant:update'
  | 'participant:manage_restricted'
  | 'consent_template:read'
  | 'consent_template:manage'
  | 'session_consent:read'
  | 'session_consent:manage'
  | 'participant_consent:read'
  | 'participant_consent:manage'
  | 'participant_consent:manage_restricted'
  | 'evidence:read'
  | 'evidence:create'
  | 'evidence:update'
  | 'evidence:transition'
  | 'evidence:manage_restricted'
  | 'evidence_link:read'
  | 'evidence_link:manage'
  | 'evidence_review:list'
  | 'evidence_review:read'
  | 'evidence_review:assign'
  | 'evidence_review:reassign'
  | 'evidence_review:start'
  | 'evidence_review:clarify'
  | 'evidence_review:respond'
  | 'evidence_review:correct'
  | 'evidence_review:validate'
  | 'evidence_review:reject'
  | 'evidence_review:view_history'
  | 'evidence_review:manage_restricted'
  | 'transcript:read'
  | 'transcript:create'
  | 'transcript:update'
  | 'summary:read'
  | 'summary:create'
  | 'summary:update'
  | 'outcome:read'
  | 'outcome:create'
  | 'outcome:update'
  | 'outcome:transition'
  | 'outcome:confirm'
  | 'outcome:close'
  | 'outcome:link_support'
  | 'report:read'
  | 'report:create'
  | 'report:update'
  | 'report:submit'
  | 'report:approve'
  | 'report:publish'
  | 'report:export'
  | 'agenda_item:read'
  | 'agenda_item:manage'
  | 'resource:read'
  | 'resource:manage';

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
