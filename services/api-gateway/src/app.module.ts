/**
 * Composition root.
 *
 * Every adapter is bound here and nowhere else, so "what implementation is
 * actually running?" has one answer in one file (ADR-0003).
 */

import { Module } from '@nestjs/common';

import { loadConfigOrExit, type WitnessConfig } from '@witness/config';

import {
  AuthenticationController,
  CurrentUserController,
} from './authn/authentication.controller.js';
import { AuthenticationService } from './authn/authentication.service.js';
import { DevelopmentIdentityProviderAdapter } from './authn/development-identity-provider.adapter.js';
import { IdentityProviderPort } from './authn/identity-provider.port.js';
import { KeycloakOidcAdapter } from './authn/keycloak-oidc.adapter.js';
import { SessionService } from './authn/session.service.js';
import { AuthorizationPort } from './authz/authorization.port.js';
import { PolicyEngineService } from './authz/policy-engine.service.js';
import { PolicyEnforcementService } from './authz/policy-enforcement.service.js';
import { RoleResolutionService } from './authz/role-resolution.service.js';
import { SessionAuthenticator } from './authz/session-authenticator.js';
import { SessionBackedAuthorizationAdapter } from './authz/session-backed.adapter.js';
import { ConsentPolicyService } from './consent/consent-policy.service.js';
import { ConsentTemplatesController } from './consent-templates/consent-templates.controller.js';
import { ConsentTemplatesService } from './consent-templates/consent-templates.service.js';
import { EvidenceController } from './evidence/evidence.controller.js';
import { EvidenceAttachmentService } from './evidence/evidence-attachment.service.js';
import { EvidenceLinkService } from './evidence/evidence-link.service.js';
import { EvidenceReviewController } from './evidence/evidence-review.controller.js';
import { EvidenceReviewService } from './evidence/evidence-review.service.js';
import { EvidenceService } from './evidence/evidence.service.js';
import { HealthController } from './health/health.controller.js';
import { PrismaService } from './infrastructure/prisma.service.js';
import { OrganisationInvitationsController } from './organisation-invitations/organisation-invitations.controller.js';
import { OrganisationInvitationsService } from './organisation-invitations/organisation-invitations.service.js';
import { OrganisationMembershipsController } from './organisation-memberships/organisation-memberships.controller.js';
import { OrganisationMembershipsService } from './organisation-memberships/organisation-memberships.service.js';
import { OrganisationRoleAssignmentsController } from './organisation-role-assignments/organisation-role-assignments.controller.js';
import { OrganisationRoleAssignmentsService } from './organisation-role-assignments/organisation-role-assignments.service.js';
import { OrganisationsController } from './organisations/organisations.controller.js';
import { OrganisationsService } from './organisations/organisations.service.js';
import { OutcomesController } from './outcomes/outcomes.controller.js';
import { OutcomesService } from './outcomes/outcomes.service.js';
import { OutcomeSupportService } from './outcomes/outcome-support.service.js';
import { ParticipantConsentRecordsController } from './participant-consent-records/participant-consent-records.controller.js';
import { ParticipantConsentRecordsService } from './participant-consent-records/participant-consent-records.service.js';
import { ParticipantsController } from './participants/participants.controller.js';
import { ParticipantsService } from './participants/participants.service.js';
import { RecordsController } from './records/records.controller.js';
import { ReportsController } from './reports/reports.controller.js';
import { ReportsService } from './reports/reports.service.js';
import { RecordsService } from './records/records.service.js';
import { RolesController } from './roles/roles.controller.js';
import { SessionConsentConfigurationController } from './session-consent-configuration/session-consent-configuration.controller.js';
import { SessionConsentConfigurationService } from './session-consent-configuration/session-consent-configuration.service.js';
import { SessionsController } from './sessions/sessions.controller.js';
import { SessionsService } from './sessions/sessions.service.js';
import { WITNESS_CONFIG } from './tokens.js';
import { UsersController } from './users/users.controller.js';
import { UsersService } from './users/users.service.js';
import { WorkspaceMembershipsController } from './workspace-memberships/workspace-memberships.controller.js';
import { WorkspaceMembershipsService } from './workspace-memberships/workspace-memberships.service.js';
import { WorkspaceRoleAssignmentsController } from './workspace-role-assignments/workspace-role-assignments.controller.js';
import { WorkspaceRoleAssignmentsService } from './workspace-role-assignments/workspace-role-assignments.service.js';
import { WorkspacesController } from './workspaces/workspaces.controller.js';
import { WorkspacesService } from './workspaces/workspaces.service.js';

@Module({
  controllers: [
    HealthController,
    RecordsController,
    OrganisationsController,
    WorkspacesController,
    UsersController,
    OrganisationInvitationsController,
    OrganisationMembershipsController,
    WorkspaceMembershipsController,
    RolesController,
    OrganisationRoleAssignmentsController,
    WorkspaceRoleAssignmentsController,
    SessionsController,
    ParticipantsController,
    ConsentTemplatesController,
    SessionConsentConfigurationController,
    ParticipantConsentRecordsController,
    EvidenceController,
    EvidenceReviewController,
    OutcomesController,
    ReportsController,
    AuthenticationController,
    CurrentUserController,
  ],
  providers: [
    PrismaService,
    RecordsService,
    OrganisationsService,
    WorkspacesService,
    UsersService,
    OrganisationInvitationsService,
    OrganisationMembershipsService,
    WorkspaceMembershipsService,
    OrganisationRoleAssignmentsService,
    WorkspaceRoleAssignmentsService,
    SessionsService,
    ParticipantsService,
    ConsentTemplatesService,
    ConsentPolicyService,
    SessionConsentConfigurationService,
    ParticipantConsentRecordsService,
    EvidenceService,
    EvidenceAttachmentService,
    EvidenceLinkService,
    EvidenceReviewService,
    OutcomesService,
    OutcomeSupportService,
    ReportsService,
    SessionService,
    RoleResolutionService,
    PolicyEngineService,
    PolicyEnforcementService,
    SessionAuthenticator,
    {
      // Configuration is validated once, at construction. If it violates the
      // deployment-profile contract, loadConfigOrExit terminates the process
      // before a single request is accepted (ADR-0013).
      provide: WITNESS_CONFIG,
      useFactory: (): WitnessConfig => loadConfigOrExit(),
    },
    {
      // Bound in every profile now (Milestone 1.3): SessionBackedAuthorizationAdapter's
      // decide() is the shared, profile-independent role-grants table; its
      // authenticate() — the unverified dev-header path — only ever does
      // anything in the development profile, exactly as before.
      provide: AuthorizationPort,
      inject: [WITNESS_CONFIG],
      useFactory: (config: WitnessConfig): AuthorizationPort =>
        new SessionBackedAuthorizationAdapter(config.profile),
    },
    {
      // Selecting the adapter by profile here — rather than reading an env var
      // inside the adapter — keeps the decision visible at the composition
      // root, which is where someone auditing "how does this authenticate?"
      // will look first. `DevelopmentIdentityProviderAdapter` is the only
      // implementation available in this sandbox: it cannot run a live
      // Keycloak container (no working Docker daemon), so the real
      // `KeycloakOidcAdapter` is written and unit-tested but not
      // manually verified against a live IdP here — see the PR's Known
      // Limitations.
      provide: IdentityProviderPort,
      inject: [WITNESS_CONFIG],
      useFactory: (config: WitnessConfig): IdentityProviderPort => {
        if (config.profile === 'development') {
          return new DevelopmentIdentityProviderAdapter(
            config.profile,
            `http://localhost:${config.apiPort}`,
            config.jwtAudience,
          );
        }

        return new KeycloakOidcAdapter(
          config.oidcIssuer,
          config.oidcClientId,
          config.oidcClientSecret,
          config.jwtAudience,
        );
      },
    },
    {
      provide: AuthenticationService,
      inject: [PrismaService, IdentityProviderPort, SessionService, WITNESS_CONFIG],
      useFactory: (
        prisma: PrismaService,
        identityProvider: IdentityProviderPort,
        sessions: SessionService,
        config: WitnessConfig,
      ): AuthenticationService =>
        new AuthenticationService(
          prisma,
          identityProvider,
          sessions,
          config.oidcRedirectUri,
          config.sessionTtlMinutes,
        ),
    },
  ],
})
export class AppModule {}
