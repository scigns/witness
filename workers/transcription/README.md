# Transcription Worker

**Owner:** AI Lead
**Status:** Phase 5

Whisper transcription, diarisation and forced alignment.

Consumes `capture.session.consent_cleared.v1` — **the consent gate**. Produces
`transcription.completed.v1`.

Word-level timestamps are not a nicety: they are what make provenance precise enough to play the
exact sentence rather than a vague region. Speaker labels are mapped to real identities in a
separate, human-confirmed, auditable step — attribution is never asserted on diarisation alone.
