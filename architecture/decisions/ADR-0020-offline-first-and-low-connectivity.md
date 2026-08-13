# ADR-0020: Offline-first and low connectivity

| | |
|---|---|
| **Status** | Accepted (decision) — **not yet implemented** (see Implementation status below) |
| **Date** | 2026-07-31 |
| **Deciders** | Frontend Lead, Principal Architect, UX Lead |
| **Principles engaged** | **P8 (accessible and multilingual by default)** |

## Implementation status (added 2026-08-13)

Verified against the actual repository: no service worker, no PWA manifest, no
IndexedDB queue, no chunked/resumable upload path exist in `apps/web`. The
"Compliance and enforcement" section below describes CI gates (bundle-size
budget, Lighthouse/PWA audits, simulated-network-partition tests) that are
**not present** in this repository's actual CI configuration — the real gate
list is lint/format/typecheck, unit+invariant+adversarial tests, build,
CodeQL, dependency review, license compatibility, and secret scanning. That
section is aspirational, not current, and should not be read as an active
guarantee until it is built.

What *is* true today: the web app's initial bundle (~102 KB shared,
~131–135 KB First Load JS on the heaviest pages) is well inside the 200 KB
budget this ADR sets, and the whole backend stack (Postgres, Keycloak,
Ollama, whisper.cpp) runs with zero external network calls in the `sovereign`
profile — confirmed live via `/ready`'s `externalInferenceEnabled: false`.
That is Level 1 of a low-connectivity story (usable on a slow link, no
cloud dependency) but not Levels 2–4 of this ADR's own capture-and-sync
design, which remain to be built.

## Context

Community consultation happens where communities are: remote settlements, regional halls, field
sites, islands. Connectivity there is intermittent, expensive, slow, or absent. The engagement lead
who most needs Witness is frequently the one least able to reach it.

If Witness only works on a good connection, it works best for head-office staff and worst for the
frontline — inverting the equity outcome the project exists to produce. Principle P8 is not a
usability nicety; it is a statement about who the product is for.

Two distinct problems:

1. **Field capture** — recording a session with no connectivity at all, syncing later
2. **Degraded usage** — using Witness over a slow, expensive or unreliable link

## Decision

> We will build the web application as an **offline-capable Progressive Web App** with local capture
> and deferred sync, and we will hold a **strict performance budget** for low-bandwidth operation.

**Offline capture:** record audio locally, capture session metadata and participant lists, capture
consent (including verbal consent recorded as audio), queue everything durably in IndexedDB, and sync
when connectivity returns with explicit, visible, resumable progress.

**Conflict resolution:** field capture is append-only. A queued session creates a new session on
sync; it never overwrites server state. This eliminates the hardest class of offline conflict by
construction rather than by merge algorithm.

**Performance budget:** initial load ≤ 200 KB gzipped JavaScript; usable on a 2G connection;
functional on five-year-old Android hardware.

## Options considered

### Option A — Online-only web application

**Pros:** far simpler; no sync, no offline state, no conflict handling.
**Cons:** unusable where it is most needed. Rejected on principle P8.

### Option B — Native mobile applications

**Pros:** best offline experience; best audio capture; background recording.
**Cons:** two additional codebases, two app store relationships, two release processes — a
substantial permanent maintenance burden for a small team. App store distribution is also a
sovereignty problem: an air-gapped institution cannot install from a store. **Rejected**, but this is
the strongest alternative and it is deferred rather than dismissed: if field evidence shows the PWA
is inadequate for audio capture, we revisit with data.

### Option C — Offline-capable PWA *(chosen)*

**Pros:** one codebase; installable; no app store dependency, so air-gapped distribution works;
service worker gives real offline capability; adequate audio capture via MediaRecorder.
**Cons:** browser audio capture is less reliable than native — background recording, screen lock and
long-session behaviour vary by platform and will produce real field failures. Storage quotas are
browser-controlled. iOS Safari has historically been the weakest PWA target.

### Option D — Separate lightweight field-capture tool

**Pros:** purpose-built and minimal.
**Cons:** another artefact to build and maintain, and a fragmented experience. Reconsider only if the
PWA proves inadequate.

## Consequences

### Positive

- Field workers can capture sessions with no connectivity, which is the core equity requirement.
- One codebase; no app store dependency; air-gapped distribution works.
- The performance budget benefits every user, not only those on poor connections.
- Append-only sync avoids merge conflicts entirely — a large simplification bought by a design
  constraint.

### Negative

- **Browser audio capture is genuinely less reliable than native.** Long recordings, screen lock and
  backgrounding behave inconsistently across platforms. We will have field failures, and we should
  set expectations honestly rather than discover them with users.
- Offline state, sync queues and service workers are a meaningful source of complexity and of bugs
  that are hard to reproduce.
- Storage quota is browser-controlled; a long session could exceed it. Requires chunked storage and
  clear warnings before capture begins, not after.
- The performance budget constrains frontend choices for the whole project — heavy libraries are
  simply unavailable to us.

### Risks accepted

- **Data loss during field capture** — the most serious risk in this ADR. A recording lost before sync
  is often irreplaceable; the meeting will not reconvene. Mitigations: durable IndexedDB writes with
  chunked flushing during recording rather than at the end; explicit unsync'd-data warnings;
  export-to-file as a manual fallback; a documented recovery procedure. This is worth
  disproportionate engineering care.
- iOS PWA limitations restricting some users. Mitigation: platform-specific guidance and honest
  documentation of what works where.

## Compliance and enforcement

- Bundle size budget enforced in CI; exceeding it fails the build.
- Lighthouse performance and PWA audits in CI with minimum thresholds.
- Offline capability tested in CI with a simulated network partition.
- Sync is tested against interruption at every stage — mid-upload, mid-queue, partial failure.
- No user-facing string is hard-coded; ICU message format throughout (also P8).
- WCAG 2.2 AA is a merge gate on every UI component.

## Reversal

Removing offline capability would simplify the frontend considerably and abandon the users the
principle exists to serve. Adding native applications later remains open and does not require
reversing this — the PWA would remain for desktop and air-gapped use.

## References

- [`architecture/DEPLOYMENT_ARCHITECTURE.md`](../DEPLOYMENT_ARCHITECTURE.md) · [WCAG
  2.2](https://www.w3.org/TR/WCAG22/) · [Web Almanac: PWA](https://almanac.httparchive.org/)
