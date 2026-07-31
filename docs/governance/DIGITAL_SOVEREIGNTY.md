# Digital Sovereignty

**Owner:** Governance Lead & CTO
**Status:** Active — binding commitment
**Decision records:** [ADR-0009](../../architecture/decisions/ADR-0009-ai-abstraction-and-model-sovereignty.md) · [ADR-0013](../../architecture/decisions/ADR-0013-tenancy-and-deployment-topology.md)
**Principle:** P1

---

## The commitment

> **Every organisation running Witness owns its knowledge, its models, its storage and its compute.
> The default deployment sends zero bytes outside the operator's network boundary. There is no
> licence server, no telemetry endpoint, no update check, and no version of Witness in which we hold
> your data.**

This is not a configuration option we ship in the "on" position. It is a property we test in CI, and
a claim any operator can verify by watching their own network.

## Why this is not negotiable

A government that cannot run its own institutional memory on its own soil, inspect its own source
code, and leave without losing its data is not sovereign in any meaningful sense — it is a tenant.

Public institutions have learned this expensively. Systems procured on favourable terms became
unfavourable at renewal. Data held in a vendor's format became inaccessible when the relationship
ended. Capabilities that were free became metered. Services were discontinued for commercial reasons
that had nothing to do with the institutions depending on them.

Witness holds material that is more sensitive than most: in-camera deliberation, community testimony,
culturally restricted knowledge. If we reproduced that dependency, we would be building a
concentration of leverage over public institutions that nobody voted for.

## The seven guarantees

### 1. No default egress

The `sovereign` deployment profile makes **zero** outbound connections. Not for licensing, not for
telemetry, not for updates, not for model inference.

**How it is enforced:** dual-layer — network policy *and* application-level allowlist, because one
will eventually be misconfigured. A sovereign-profile instance with an external provider configured
**refuses to start**. `make egress-test` runs the full stack in a network namespace with no route and
asserts complete function; it runs in CI, so a regression that introduces a phone-home breaks the
build.

### 2. No telemetry, ever

We collect nothing from your deployment. There is no upstream collector, no anonymised usage
statistics, no crash reporting, no "help us improve" toggle.

**We will not add one**, including as opt-in. An opt-in telemetry channel is infrastructure that
exists; infrastructure that exists gets used; and the argument for expanding it is always reasonable.
We would rather have worse product data and a guarantee we can state without qualification.

Consequence, stated honestly: we know less about how Witness is used than a normal product team
would. We learn through reference deployments who agree to tell us, and through operators who choose
to report. That is a real cost and we accept it.

### 3. Local models by default

Transcription and extraction run on the operator's hardware via Whisper and Ollama. External model
providers require: the profile to permit egress, per-tenant opt-in, an explicit allowlist, and every
call logged and attributable.

Changing that posture emits `admin.egress_policy.changed.v1`, which is **surfaced to end users** —
not merely logged to an admin console. If an institution changes its configuration such that recorded
conversations may now be sent to a third party, the people recorded have a right to know.

**The honest cost:** local models are worse than frontier models at some tasks, in some languages. We
publish those numbers per release, including where they are poor. Sovereignty has a quality cost and
users deserve to know its size rather than discover it.

### 4. Air-gapped operation is a first-class, tested path

| Requirement | How |
|---|---|
| No registry access | Offline bundle: OCI archives, checksum-verified |
| No model downloads | Weights in the bundle, checksum-pinned |
| No runtime package installs | Everything vendored into images |
| No licence server, telemetry or update check | **None exist.** There is nothing to disable |
| Security advisories | Documented out-of-band distribution process |

The offline bundle ships with **every** release, not on request. A bundle produced only when asked
for is a bundle that is never tested.

### 5. Open source, permanently

GPL-3.0 for the platform; Apache-2.0 for contracts and SDKs so integrators face no copyleft exposure
([ADR-0002](../../architecture/decisions/ADR-0002-licensing-strategy.md)).

**No open core. No proprietary edition. No "community edition" with the interesting parts removed.**
No feature that exists only in a hosted version. If we build it, it is in the repository.

### 6. Exit is a feature, and we measure it

Lock-in is the failure mode Witness exists to eliminate. We are not going to reproduce it quietly and
call it retention.

| Exit capability | Format |
|---|---|
| Knowledge graph | JSON-LD, RDF/Turtle, GraphML, CSV |
| Transcripts and assertions | JSON, CSV |
| Media | Original files, unmodified |
| Consent records | JSON with full provenance |
| Audit log | JSON, with the verification tool |
| Documents | Originals |

Everything is in open formats with no proprietary dependency. **A successful migration away from
Witness counts as a feature working as designed**, and it is one of the metrics in
[`VISION.md`](../../VISION.md).

### 7. Fork rights, made practical

Anyone may fork Witness at any time, for any reason, including disagreement with our governance. We
consider that the ultimate check on our legitimacy.

We make it practical rather than nominal: no hidden build steps, no undocumented infrastructure, no
proprietary components, no secret knowledge. Everything needed to build and run the project is in the
repository. A full mirror to an independent forge is a Phase 7 deliverable, because a
public-infrastructure project that can only be built on one commercial platform is not credibly
sovereign — including when that platform is the one we currently use.

## Data residency

`WITNESS_DATA_RESIDENCY` is declared by the operator and **surfaced in the interface**, so a person
recorded can see where their words are stored. Witness performs no cross-border transfer of its own
accord; there is no code path that could.

## What sovereignty does *not* mean

Being honest about the limits keeps the claim credible:

- **It does not mean we can protect you from your own government.** Witness runs on your
  infrastructure under your law. If a court compels disclosure, the software will not prevent it.
- **It does not mean isolation.** Federation, export and integration are all supported — deliberately,
  under your control.
- **It does not mean no dependencies.** We depend on open-source software, and every dependency
  carries an exit strategy in [`OSS_EVALUATION.md`](../research/OSS_EVALUATION.md).
- **It does not mean free of cost.** You pay for hardware, storage and the staff time to operate it.
  There is no licence fee and no cost that grows with the value of your data.
- **It does not mean we can vouch for your configuration.** We make the secure, sovereign path the
  default and the easy one. You can still misconfigure it, and we would rather say so.

## How to verify our claims

Do not take our word for it:

1. **Watch your network.** Run the sovereign profile and monitor egress. You should see nothing.
2. **Run `make egress-test`.** The same check runs in our CI.
3. **Read the code.** All of it is here.
4. **Read the threat model** in [`SECURITY_ARCHITECTURE.md`](../../architecture/SECURITY_ARCHITECTURE.md).
5. **Test your exit** before you need it. Export everything, verify it is complete and usable. If it
   is not, that is a bug and we want the report.

If you find us in breach of anything on this page, that is a **security-severity issue** and we want
to hear about it through [`SECURITY.md`](../../SECURITY.md).

## Governance protection

Weakening any commitment on this page requires Steering Committee approval and is subject to the
**Governance Lead's absolute veto**, which neither the CTO nor the Founder can override
([`GOVERNANCE.md`](../../GOVERNANCE.md)).

We have also constrained our own funding: no funding conditioned on closing source, on hosting-only
availability, on weakening the sovereignty default, or on data access for the funder
([`FUNDING.md`](FUNDING.md)).

The point of writing all of this down is that future versions of us, under commercial pressure,
should find it hard to quietly change.
