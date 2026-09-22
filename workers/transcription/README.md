# Transcription Worker

**Owner:** AI Lead
**Status:** Reserved — Phase 5 as a standalone worker. Not built as a separate deployable; this
directory contains only this planning document. **Transcription itself is real and running
today** — a local Whisper CLI adapter
(`services/api-gateway/src/transcription/local-whisper.adapter.ts`) runs inside `services/
api-gateway`, not as a queued worker subscribing to an event topology. Diarisation and forced
alignment, which this document also plans, are not implemented anywhere (STATUS.md: "Speaker
diarisation — Deferred").

Whisper transcription, diarisation and forced alignment.

Consumes `capture.session.consent_cleared.v1` — **the consent gate**. Produces
`transcription.completed.v1`.

Word-level timestamps are not a nicety: they are what make provenance precise enough to play the
exact sentence rather than a vague region. Speaker labels are mapped to real identities in a
separate, human-confirmed, auditable step — attribution is never asserted on diarisation alone.
