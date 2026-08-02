# Postmortem: <incident title>

| | |
|---|---|
| **Date** | YYYY-MM-DD |
| **Severity** | SEV-1 \| SEV-2 |
| **Duration** | detection → resolution |
| **Author** | |
| **Status** | Draft \| Reviewed \| Published |

> **Blameless.** The question is *"what about the system allowed this?"* — never *"who did this?"*
>
> A postmortem that identifies a person as the cause has failed. People make mistakes; that is a
> constant. The interesting question is why the system let the mistake have consequences.

## Summary

Three sentences. What happened, who was affected, how it was resolved.

## Impact

- **Who was affected** — which operators, which tenants, which data subjects
- **What was exposed, lost or delayed**
- **Was consent violated?** If yes, this is SEV-1 regardless of scale, and it must say so plainly
- **Was any provenance chain broken?**

## Timeline

| Time (UTC) | Event |
|---|---|
| | First occurrence (often before detection) |
| | Detected — **by what? a user or a monitor?** |
| | Declared |
| | Contained |
| | Resolved |

The gap between first occurrence and detection is usually the most informative number in the document.

## What happened

Technical narrative. Enough detail that a reader could reconstruct it.

## Why it happened

Contributing factors — plural. Single-cause incidents are rare, and "human error" is never a root
cause; it is a prompt to ask what made the error possible and consequential.

## What went well

Genuinely. Detection, response, a control that held. Postmortems that are only failure are demoralising
and teach nothing about what to preserve.

## What did not go well

Including anything about our process, documentation or tooling that made this harder.

## Where we got lucky

The most under-used section. What could have made this much worse but happened not to?

## Actions

| # | Action | Type | Owner | Due |
|---|---|---|---|---|
| 1 | | Prevent / Detect / Mitigate / Process | | |

Prefer **detection** and **prevention** over "be more careful". At least one action should make this
class of incident structurally impossible or immediately visible.

## Publication

Published in redacted form — operators of other deployments need to know. Redact only what identifies
individuals or creates active exposure. **We publish even when it is embarrassing:** operators of
public infrastructure need accurate information more than we need to look competent.
