# AI Orchestrator

**Owner:** AI Lead · Security Lead
**Status:** Phase 5

LiteLLM gateway, model registry, extraction pipeline, and **egress policy enforcement**.

The single chokepoint where 'did this tenant permit an external call?' is answered. The sovereign
profile makes zero external calls, and an instance misconfigured otherwise **refuses to start**
([ADR-0009](../../architecture/decisions/ADR-0009-ai-abstraction-and-model-sovereignty.md)).

Model output is parsed as **data against a strict schema**, never executed as instruction. No
tool-calling with side effects exists in the extraction path.
