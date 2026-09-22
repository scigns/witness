# Ingestion & Media

**Owner:** Backend Lead · Governance Lead
**Status:** Reserved — Phase 3 as a standalone service. Not built, not deployed. This directory
contains only this planning document. Sessions, participants and evidence (the real equivalent of
"media objects and documents" here) are implemented inside `services/api-gateway`
(`sessions/`, `participants/`, `evidence/`) today, not as a separate ingestion service, and not
built around the `capture.session.consent_cleared.v1` event topology this document describes — no
event-bus (NATS) integration exists yet.

Sessions, participants, media objects, documents and retention lifecycle.

**The consent gate lives in the topology here.** Media without cleared consent is stored encrypted
and never enters the pipeline — the transcription worker subscribes to
`capture.session.consent_cleared.v1`, not to `capture.media.ingested.v1`.
