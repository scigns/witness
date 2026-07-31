# Extraction Worker

**Owner:** AI Lead
**Status:** Phase 5

LangGraph pipeline producing **candidate** assertions from transcripts and documents.

Every candidate cites the utterance span that produced it and records model ID, model version,
prompt ID and prompt hash — permanently. In 2032 someone will ask why the system believed
something, and 'an LLM extracted it' is not an answer.

**Candidates are not assertions.** They are distinct types, and only human confirmation creates an
assertion ([ADR-0012](../../architecture/decisions/ADR-0012-provenance-and-human-in-the-loop.md)).
