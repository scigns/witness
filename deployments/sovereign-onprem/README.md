# Sovereign On-Premise Deployment

**Owner:** Infrastructure Lead
**Status:** Phase 2

**The default and recommended topology.** Profile: `sovereign`.

Sends **zero bytes** outside the operator's network boundary. No telemetry, no licence check, no
update check, no external model calls. Supports air-gapped installation from an offline bundle.

Verified by `make egress-test`, which runs in CI. See
[`DIGITAL_SOVEREIGNTY.md`](../../docs/governance/DIGITAL_SOVEREIGNTY.md).
