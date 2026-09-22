# AI Orchestrator

**Owner:** AI Lead · Security Lead
**Status:** Reserved — Phase 5. Not built, not deployed, no active development. This directory
contains only this planning document; there is no `src/`. No AI-assisted extraction runs anywhere
in Witness today (STATUS.md); when it is built, this is where it is planned to live. Do not treat
this file as evidence any of the below exists yet.

LiteLLM gateway, model registry, extraction pipeline, and **egress policy enforcement**.

The single chokepoint where 'did this tenant permit an external call?' is answered. The sovereign
profile makes zero external calls, and an instance misconfigured otherwise **refuses to start**
([ADR-0009](../../architecture/decisions/ADR-0009-ai-abstraction-and-model-sovereignty.md)).

Model output is parsed as **data against a strict schema**, never executed as instruction. No
tool-calling with side effects exists in the extraction path.
