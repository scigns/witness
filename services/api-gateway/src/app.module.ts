/**
 * Composition root.
 *
 * Every adapter is bound here and nowhere else, so "what implementation is
 * actually running?" has one answer in one file (ADR-0003).
 */

import { Module } from '@nestjs/common';

import { loadConfigOrExit, type WitnessConfig } from '@witness/config';

import { AuthorizationPort } from './authz/authorization.port.js';
import { DevelopmentAuthorizationAdapter } from './authz/development.adapter.js';
import { HealthController } from './health/health.controller.js';
import { PrismaService } from './infrastructure/prisma.service.js';
import { OrganisationsController } from './organisations/organisations.controller.js';
import { OrganisationsService } from './organisations/organisations.service.js';
import { RecordsController } from './records/records.controller.js';
import { RecordsService } from './records/records.service.js';
import { WITNESS_CONFIG } from './tokens.js';
import { WorkspacesController } from './workspaces/workspaces.controller.js';
import { WorkspacesService } from './workspaces/workspaces.service.js';

@Module({
  controllers: [HealthController, RecordsController, OrganisationsController, WorkspacesController],
  providers: [
    PrismaService,
    RecordsService,
    OrganisationsService,
    WorkspacesService,
    {
      // Configuration is validated once, at construction. If it violates the
      // deployment-profile contract, loadConfigOrExit terminates the process
      // before a single request is accepted (ADR-0013).
      provide: WITNESS_CONFIG,
      useFactory: (): WitnessConfig => loadConfigOrExit(),
    },
    {
      provide: AuthorizationPort,
      inject: [WITNESS_CONFIG],
      useFactory: (config: WitnessConfig): AuthorizationPort => {
        // Selecting the adapter by profile here — rather than reading an env var
        // inside the adapter — keeps the decision visible at the composition
        // root, which is where someone auditing "how does this authenticate?"
        // will look first.
        if (config.profile === 'development') {
          return new DevelopmentAuthorizationAdapter(config.profile);
        }

        throw new Error(
          `No authorisation adapter is available for the '${config.profile}' profile. ` +
            'Keycloak and Casbin integration is Phase 2 (ADR-0007, roadmap 2.5/2.6). ' +
            'Witness refuses to start rather than serve requests with no authorisation.',
        );
      },
    },
  ],
})
export class AppModule {}
