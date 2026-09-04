# Witness Commercial Website Analytics Plan

**Owner:** Product, Commercial, Privacy and Engineering
**Status:** Planning; no public analytics implemented
**Last reviewed:** 2026-09-02

## Current state

No public website analytics or commercial event instrumentation exists. Grafana product telemetry is
configured not to report upstream, and the sovereign profile prohibits analytics egress.

## Measurement principles

- Measure qualified organisations moving toward paid use, not traffic for its own sake.
- Separate anonymous website measurement, consented marketing, lead records and product activation.
- Never send evidence, decision, contribution or customer-sensitive content.
- Prefer first-party, cookieless or minimal-cookie measurement.
- Document retention, access and deletion before collection begins.
- Preserve a zero-egress sovereign deployment configuration.

## Initial funnel

Discover → Understand → Intent → Signup → Activation → Organisation → Commercial opportunity → Paid
pilot → Customer → Renewal.

MKT-13 will define event schemas and data ownership. Candidate public events include homepage,
platform, solution, pricing and trust views; demo open/complete; demo request; contact submission; and
signup start. Product activation requires organisation, program, evidence, decision and provenance
link creation without recording their content.

## Open decisions

- Edge analytics provider and permanent commercial system of record.
- Retention windows and geographic/data-processing requirements.
- Consent threshold for aggregate web metrics versus marketing subscription.
- Identity-safe attribution between anonymous intent, controlled signup and organisation activation.
