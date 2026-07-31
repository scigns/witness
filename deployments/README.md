# Deployments

**Owner:** Infrastructure Lead
**Status:** Phase 2 deliverable

Composed, opinionated deployment topologies. Where [`infrastructure/`](../infrastructure/) provides the
building blocks, this provides the assembled configurations an operator actually runs.

| Topology | For | Profile |
|---|---|---|
| [`local/`](local/) | Development | `development` |
| [`sovereign-onprem/`](sovereign-onprem/) | **The default** — government, Indigenous organisation, air-gapped | `sovereign` |
| [`cloud-managed/`](cloud-managed/) | Institutions with an approved cloud arrangement | `sovereign` or `hybrid` |

## `sovereign-onprem` is the default for a reason

It sends **zero bytes** outside the operator's network boundary. No telemetry, no licence check, no
update check, no external model calls. Verified by `make egress-test`, which runs in CI.

Note that `cloud-managed` still defaults to the `sovereign` profile. Running on cloud infrastructure is
a hosting decision; permitting egress is a separate, deliberate one.

See [`docs/operations/DEPLOYMENT_GUIDE.md`](../docs/operations/DEPLOYMENT_GUIDE.md).
