# ADR-0002: Licensing strategy

| | |
|---|---|
| **Status** | Accepted (with one action outstanding — see Compliance) |
| **Date** | 2026-07-31 |
| **Deciders** | Founder, CTO, Open Source Lead, Steering Committee |
| **Principles engaged** | P1 (sovereignty) |

## Context

The repository was initialised with **GPL-3.0**. Licensing determines who can adopt Witness, who can
build on it, and whether a vendor can take it proprietary — so it is a governance decision at least
as much as a legal one.

Three constraints:

1. **No proprietary capture.** A vendor must not be able to take Witness, add features, and offer a
   closed derivative to the same governments we serve. Copyleft addresses this.
2. **Government procurement reality.** Some public-sector procurement processes are wary of strong
   copyleft, often through misunderstanding. This is a real adoption barrier for the *platform*,
   though rarely for merely *using* software.
3. **Integration must be frictionless.** If a ministry's internal system must integrate with
   Witness, requiring that system to become GPL is a serious deterrent — and integration is how
   Witness becomes infrastructure rather than an island.

There is also a specific consideration for a network-delivered platform: GPL-3.0 obligations trigger
on *distribution*, not on providing a service over a network. A vendor could run a modified Witness
as a hosted service without releasing changes. AGPL-3.0 closes that gap.

## Decision

> We will license the Witness platform under **GPL-3.0-or-later**, and we will license the API
> contracts, schemas, event definitions and client SDKs under **Apache-2.0**, so that integrators
> can build against Witness without copyleft obligations flowing into their own systems.

The `sdk/`, `packages/contracts/` and published ontology artefacts carry Apache-2.0 with an explicit
`LICENSE` file in each directory. Everything else is GPL-3.0-or-later.

## Options considered

### Option A — GPL-3.0 throughout

**Pros:** simple; strong protection against proprietary capture.
**Cons:** integrators writing against our SDK face copyleft questions about their own systems, which
in practice means legal review and often abandonment. Suppresses exactly the ecosystem we need.

### Option B — GPL-3.0 platform + Apache-2.0 contracts and SDKs *(chosen)*

**Pros:** the platform stays protected; integration is frictionless; matches well-understood practice
(Linux with its syscall exception, GCC with its runtime exception). A government system calling our
REST API through our SDK has no copyleft exposure.
**Cons:** a boundary to maintain — contributors must know which side of it they are on. A vendor could
build a proprietary product *around* Witness using the SDK, which we consider acceptable and even
desirable; what they cannot do is take the platform itself proprietary.

### Option C — AGPL-3.0 platform

**Pros:** closes the network-service gap; a hosted modified Witness would have to publish changes.
**Cons:** significantly more procurement resistance in government contexts; some organisations have
blanket AGPL prohibitions. Given that our *primary* deployment model is self-hosting by the
institution itself — not a hosted service — the gap AGPL closes is much narrower for us than for a
typical SaaS-shaped project.
**This is the strongest rejected alternative** and the one most likely to be revisited. If a
commercial hosted-Witness market emerges, the calculation changes materially.

### Option D — Permissive throughout (Apache-2.0 / MIT)

**Pros:** maximum adoption; no procurement friction anywhere.
**Cons:** permits exactly the proprietary capture that principle P1 exists to prevent. A vendor could
build "Witness Enterprise", capture the government market, and leave the open version to rot. This is
a well-documented pattern. Rejected.

## Consequences

### Positive

- The platform cannot be taken proprietary.
- Integrators face no copyleft exposure — the ecosystem can grow.
- Commercial support, hosting and integration businesses remain viable, which is how the project
  becomes sustainable.
- Compatible with Digital Public Goods Alliance requirements.

### Negative

- Two licences means a boundary contributors can get wrong. Requires tooling and vigilance.
- GPL-3.0 excludes some dependency licences from the platform (Apache-2.0 is fine; SSPL, BUSL and
  RSAL are not) — which constrains our technology choices, though we consider that constraint
  healthy.
- The network-service gap remains open. We accept it, with eyes open.
- Some procurement processes will still object to GPL. We will need to write explanatory material
  for evaluators.

### Risks accepted

That a hosted-service market emerges and someone runs a modified Witness commercially without
contributing back. Signal: any commercial Witness hosting offering. Response: evaluate relicensing
to AGPL for future versions, which requires the consent of all copyright holders — which is precisely
why we must track contributor provenance carefully from day one.

## Compliance and enforcement

- `LICENSE` at the repository root (GPL-3.0); `LICENSE` in `sdk/` and `packages/contracts/`
  (Apache-2.0); an `SPDX-License-Identifier` header in every source file.
- A CI licence gate rejects any dependency whose licence is incompatible with the consuming
  package's licence.
- **Developer Certificate of Origin**, not a CLA. Contributors retain copyright. This is
  deliberate: a CLA that assigns rights to a founding entity is a lever for future relicensing, and
  a project claiming to be public infrastructure should not hold that lever.
- **⚠️ Outstanding action (open decision D-1):** the Apache-2.0 designation for `sdk/` and
  `packages/contracts/` must be confirmed with all copyright holders before those directories
  contain substantive third-party contributions. Trivial to do now; expensive later. Owner: Open
  Source Lead, before Phase 2.

## Reversal

Relicensing requires the agreement of every copyright holder. With DCO and no CLA, that means every
contributor. This becomes practically irreversible within a year or two of accepting outside
contributions — which is exactly why it is decided now, and why D-1 must not slip.

## References

- [GPL-3.0](https://www.gnu.org/licenses/gpl-3.0.en.html) · [Apache-2.0](https://www.apache.org/licenses/LICENSE-2.0)
- [Developer Certificate of Origin](https://developercertificate.org/)
- [Digital Public Goods Standard](https://digitalpublicgoods.net/standard/)
