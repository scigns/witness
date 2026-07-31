# Ingestion & Media

**Owner:** Backend Lead · Governance Lead
**Status:** Phase 3

Sessions, participants, media objects, documents and retention lifecycle.

**The consent gate lives in the topology here.** Media without cleared consent is stored encrypted
and never enters the pipeline — the transcription worker subscribes to
`capture.session.consent_cleared.v1`, not to `capture.media.ingested.v1`.
