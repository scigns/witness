# Graph Projector

**Owner:** Knowledge Graph Lead
**Status:** Phase 4

Projects confirmed assertions from the event log into Neo4j.

**Idempotent** (`MERGE`, never `CREATE`), checkpointed and resumable. The whole graph can be dropped
and rebuilt from the log — verified by a CI test that does exactly that and asserts equivalence.

If that test does not pass, the central architectural claim of this project is unverified.
