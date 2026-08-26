# Pricing and billing choices

**Status:** Milestone C2 implemented
**Last reviewed:** 2026-08-26

## Customer journey

`/pricing` is public and reads the active plan catalogue from `GET /api/v1/plans`. Prices are AUD
minor-unit values rendered as monthly or annual choices. FREE starts the existing organisation
onboarding journey. Paid calls to action lead to sign-in; they do not claim that checkout exists.

An organisation administrator can open `/organisations/{organisationId}/billing` from the
Administration menu. The page shows the current plan and status, resolved C1 entitlements, existing
server-measured usage, plan/frequency choices, and a preferred payment method. Invoice and bank
transfer are preferences only until C3; card is also an intent only until a C4 provider is configured.

Submitting a plan change or cancellation creates a `PENDING` commercial change request. It does not
update the subscription, entitlements, operational quota, or access. INSTITUTIONAL uses the distinct
`REQUEST_QUOTE` action with no billing frequency or payment preference; it records interest only and
is not a purchase, checkout, settlement, procurement workflow, or activation.

The latest pending request supersedes an older pending request, and retrying the same
organisation-scoped idempotency key returns the original record. Each intent snapshots the source
subscription identifier and `updatedAt` value so a later applicator can reject stale intent rather
than applying it to different commercial state. Cancellation and paid-to-FREE downgrade record the
current period end as their requested effective time when one exists. Every accepted request is
written to the existing hash-chained audit log without billing credentials or remittance details.

Later milestones must treat `PENDING` as non-authoritative intent. Before applying any transition,
they must verify the source subscription snapshot still matches, confirm whatever settlement or
procurement conditions apply, calculate the final effective time, and perform the subscription and
entitlement transition atomically with an audit event. They must not infer settlement from payment
preference or quote interest. C5 must not change operational quotas or access merely because an intent
exists.

## Catalogue maintenance

The authoritative catalogue remains the C1 PostgreSQL `plan`, `plan_price`,
`entitlement_definition`, and `plan_entitlement` tables. Change catalogue data through a reviewed,
additive migration; do not hardcode plan-name entitlement branches in the API or web application.

Public responses deliberately contain only active plan names, descriptions, quote flags, active AUD
prices, and entitlement descriptions/values. Customer subscriptions, pending requests, actor data,
provider references, and future remittance configuration are never part of the public DTO.

Before release, validate the Prisma schema and migration on an empty supported PostgreSQL database,
then run `pnpm verify`. Pricing copy and currency/tax claims require product and operator review; the
application records configured prices and does not provide tax advice.
