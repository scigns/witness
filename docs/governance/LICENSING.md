# Licensing

**Owner:** Open Source Lead
**Status:** Active — structure implemented, copyright-holder confirmation outstanding (D-1)
**Authority:** [ADR-0002](../../architecture/decisions/ADR-0002-licensing-strategy.md)
**Change control:** Licence changes require the Steering Committee **and every copyright holder**,
with a 30-day notice period ([`GOVERNANCE.md`](../../GOVERNANCE.md))

---

## The boundary

Witness is deliberately licensed in two layers.

| Scope | Licence | Files | Why |
|---|---|---|---|
| **The platform** | `GPL-3.0-or-later` | [`LICENSE`](../../LICENSE) — applies to everything not listed below | A government cannot be handed a proprietary fork of its own memory system. Copyleft is the mechanism that makes the sovereignty claim enforceable rather than aspirational |
| **The SDKs** | `Apache-2.0` | [`sdk/LICENSE`](../../sdk/LICENSE), [`sdk/NOTICE`](../../sdk/NOTICE) | Integrators call Witness from systems we do not control. Requiring an EDRMS vendor to adopt copyleft in order to call an API would suppress the ecosystem Witness needs to become infrastructure |
| **The contracts** | `Apache-2.0` | [`packages/contracts/LICENSE`](../../packages/contracts/LICENSE), [`packages/contracts/NOTICE`](../../packages/contracts/NOTICE) | Same reasoning. API and event contracts are an interoperability surface, and interoperability surfaces must be permissive to be adopted |

Apache-2.0 rather than MIT for the permissive layer, because Apache-2.0 carries an **explicit patent
grant**. For infrastructure intended to be adopted by governments, an implicit patent position is a
procurement obstacle.

**One-way compatibility, and it matters.** Apache-2.0 code can be consumed by GPL-3.0 code. The
reverse is not true. Therefore:

- `sdk/` and `packages/contracts/` **must not** import from GPL-licensed workspace packages.
- `packages/domain`, `services/*`, `workers/*` and `apps/*` **may** import from the Apache-2.0
  packages freely.

Enforced by [`scripts/security/check-licenses.sh`](../../scripts/security/check-licenses.sh) and the
`Licence compatibility` job in `.github/workflows/security.yml`.

## Denied dependency licences

`SSPL` · `BUSL` · `Elastic-2.0` · `RSAL` · `CC-BY-NC` · `Commons Clause` · `PolyForm` · proprietary.

These are refused because they are either incompatible with GPL-3.0, or incompatible with government
procurement, or both. Redis's RSALv2 has no SPDX identifier and is therefore matched by name — see
[`docs/research/OSS_EVALUATION.md`](../research/OSS_EVALUATION.md) for the Valkey migration path.

## Copyright attribution

`NOTICE` files attribute copyright to **"The Witness Contributors"**.

This is a deliberate collective placeholder, not an omission and not a legal entity. It is used
because:

1. No foundation exists yet — foundation stewardship is Phase 8 (open decision D-5).
2. Naming an individual would need to be undone when the foundation is formed.
3. Inventing an organisational name that does not legally exist would be worse than a placeholder,
   because it would look authoritative while being false.

Contributions are made under **GPL-3.0-or-later** with **DCO sign-off**, not a CLA
([`CONTRIBUTING.md`](../../CONTRIBUTING.md) §14). No CLA means no entity holds aggregated rights,
which means relicensing later requires every contributor's agreement — a deliberate constraint that
makes proprietary capture structurally difficult.

---

## D-1 — required human action

**This is the only part of licensing that software cannot complete.**

The Apache-2.0 structure above is implemented and mechanically enforced. What remains is a legal
affirmation that only the copyright holder can make.

**Who:** the current sole copyright holder — at the time of writing, the repository owner
(`scigns`), as no third-party contributions have been merged.

**What, exactly:**

1. Confirm in writing — a signed commit, or a comment on the D-1 tracking issue — that
   `sdk/` and `packages/contracts/` are licensed **Apache-2.0**, and that the remainder of the
   repository is **GPL-3.0-or-later**.
2. Confirm the attribution string **"The Witness Contributors"** is acceptable as an interim
   placeholder pending the Phase 8 foundation decision (D-5).
3. Record the confirmation date in [`STATUS.md`](../../STATUS.md) against D-1.

**Deadline:** before `sdk/` or `packages/contracts/` accepts its first third-party contribution.

**Why the deadline is real, not procedural.** Today one person holds all rights and can change the
licence in a single commit. The moment an outside contributor's code lands in those directories,
changing the licence requires *their* agreement too — and every subsequent contributor's. There is
no later moment at which this gets cheaper. It only ever gets more expensive, and eventually
becomes impossible.

**If the answer is no:** reverting is one commit — delete `sdk/LICENSE`, `sdk/NOTICE`,
`packages/contracts/LICENSE`, `packages/contracts/NOTICE`, set both `package.json` licence fields to
`GPL-3.0-or-later`, and supersede ADR-0002. Cheap now; not later.

## Adding a new package

1. Decide which side of the boundary it sits on. **Default to GPL-3.0-or-later.** Apache-2.0 is only
   for surfaces external integrators compile against.
2. Set `license` in its `package.json` to match.
3. If Apache-2.0, add `LICENSE` and `NOTICE` to the package root.
4. Verify with `bash scripts/security/check-licenses.sh`.

If you are unsure, it is GPL-3.0-or-later. Moving a package from copyleft to permissive later is a
governance decision; moving it the other way is trivial.
