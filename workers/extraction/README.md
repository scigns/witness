# Extraction Worker

**Owner:** AI Lead
**Status:** Reserved — Phase 5. Not built, not deployed, no active development. This directory
contains only this planning document; there is no `src/`. No AI-assisted extraction pipeline runs
anywhere in Witness today — `KnowledgeCandidateAssertion.extractionMethod` is modelled in the
schema but only ever populated as `'human_manual'`. Building this is explicitly sequenced *after*
the multi-organisation collaboration and governance model (`architecture/decisions/ADR-0028`,
ADR-0027) — do not start it because this document exists.

LangGraph pipeline producing **candidate** assertions from transcripts and documents.

Every candidate cites the utterance span that produced it and records model ID, model version,
prompt ID and prompt hash — permanently. In 2032 someone will ask why the system believed
something, and 'an LLM extracted it' is not an answer.

**Candidates are not assertions.** They are distinct types, and only human confirmation creates an
assertion ([ADR-0012](../../architecture/decisions/ADR-0012-provenance-and-human-in-the-loop.md)).
