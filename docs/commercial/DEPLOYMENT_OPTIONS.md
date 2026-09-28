# Commercial deployment options

**Owner:** Infrastructure Lead & Commercial Lead
**Status:** Controlled-pilot options
**Review:** Per proposal and deployment go/no-go

Deployment is configuration of one Witness product, not a separate product line.

| Option | Typical use | Commercial components | Boundary |
|---|---|---|---|
| Hosted/cloud-managed | Approved managed infrastructure | Licence, hosting, onboarding, support | Deployment-specific residency and egress review |
| Dedicated cloud | Institutional isolation or procurement need | Licence, implementation, dedicated hosting, support | Customer-specific configuration, same core build |
| Sovereign/on-premises | Institution-operated, local or air-gapped | Licence/support, implementation, training | No hosted payment provider required; local measurement |

The deployment profile remains `sovereign`, `hybrid` or `development`. `development` is never a
production option. No proposal may promise an untested topology, availability level, residency,
backup outcome or support commitment.

Every deployment passes [pilot go/no-go](PILOT_GO_NO_GO.md), including identity, data sovereignty,
consent, backup/restore, migration, incident ownership and success measures.

## Infrastructure cost allocation

Infrastructure is a real, allocable cost against each option above, not an invisible cost the
founder absorbs by default:

| Option | Infrastructure cost allocation |
|---|---|
| Hosted/cloud-managed | Amortised across shared-tenant infrastructure; the licence/hosting component already listed above is expected to cover a proportional share of the shared DigitalOcean/Cloudflare footprint documented in `docs/infrastructure/PRODUCTION_SERVICE_INVENTORY.md` and `docs/infrastructure/LAUNCH_COST_BASELINE.md`. |
| Dedicated cloud | Infrastructure is its own line item, separate from the licence/implementation fee — a dedicated droplet (or larger, per that inventory's "Recommended" profile if the customer's summarisation/knowledge-graph needs justify it), dedicated backup retention, and any customer-specific Cloudflare configuration are priced, not bundled. |
| Sovereign/on-premises | The customer owns and pays for the infrastructure directly; Witness's fee covers deployment, configuration, upgrades, and support only — see `docs/infrastructure/DEPLOYMENT_TOPOLOGY.md` for the same GitHub/DigitalOcean/Cloudflare separation of concerns applied to a customer-operated equivalent. |

No dollar figure in this section is invented — see `LAUNCH_COST_BASELINE.md` for exactly which
costs are already documented/verified versus which still require a live pricing check before being
quoted in a proposal.
