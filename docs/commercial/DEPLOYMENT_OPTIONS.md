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
