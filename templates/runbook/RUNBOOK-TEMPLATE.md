# Runbook: <alert or scenario name>

| | |
|---|---|
| **Owner** | <role> |
| **Severity** | SEV-1 \| SEV-2 \| SEV-3 \| SEV-4 |
| **Alert** | `<metric or alert name>` |
| **Last tested** | YYYY-MM-DD |

> **Every alert has a runbook.** An alert without one is a defect — it wakes someone at 2am with no
> path forward. Written for someone who did not build the system and is tired.

## What this means

Plain language. What has actually happened, and what the user-visible impact is.

## Immediate check

The first thing to look at. One command or one dashboard.

```bash
```

## Is this urgent?

| If | Then |
|---|---|
| | Escalate immediately |
| | Handle in hours |
| | Note and handle tomorrow |

## Diagnosis

Ordered steps, most likely cause first.

## Resolution

### Most likely cause

### Other causes

## If none of this works

Who to contact, what information to gather first, and what **not** to do — including any action that
would destroy evidence needed for a postmortem.

## Verify it is fixed

How to confirm, rather than assume.

## After

- [ ] Incident recorded if SEV-1 or SEV-2
- [ ] Postmortem scheduled if SEV-1 or SEV-2
- [ ] This runbook updated if it was wrong or incomplete — **that is the most valuable output**
