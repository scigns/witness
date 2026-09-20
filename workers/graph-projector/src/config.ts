/**
 * Configuration — plain env vars, no framework. This worker is deliberately
 * not a NestJS app: it is a small, standalone consumer
 * (`workers/README.md`), and pulling in the whole DI/HTTP stack for a
 * poll-project-checkpoint loop would be exactly the "speculative
 * complexity" the originating request warned against.
 */

function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') {
    throw new Error(`${name} must be set.`);
  }
  return value;
}

function optional(name: string): string | undefined {
  const value = process.env[name];
  return value === undefined || value === '' ? undefined : value;
}

export interface ProjectorConfig {
  readonly databaseUrl: string;
  readonly neo4jUri: string;
  readonly neo4jUser: string;
  readonly neo4jPassword: string;
  readonly pollIntervalMs: number;
  readonly batchSize: number;
  readonly maxAttempts: number;
}

export function loadConfig(): ProjectorConfig {
  return {
    databaseUrl: required('DATABASE_URL'),
    neo4jUri: required('NEO4J_URI'),
    // Write credentials — deliberately named distinctly from the read-only
    // credentials `services/knowledge-graph` uses (`NEO4J_READONLY_USER`),
    // even though Neo4j Community Edition cannot yet enforce the difference
    // at the database level (see `graph-repository.port.ts`'s doc comment;
    // tracked as open decision D-4 / KG-3). Naming them differently now
    // means adopting Enterprise or Apache AGE later is a credential
    // rotation, not a naming migration.
    neo4jUser: optional('NEO4J_PROJECTOR_USER') ?? required('NEO4J_USER'),
    neo4jPassword: optional('NEO4J_PROJECTOR_PASSWORD') ?? required('NEO4J_PASSWORD'),
    pollIntervalMs: Number(optional('GRAPH_PROJECTOR_POLL_INTERVAL_MS') ?? 2000),
    batchSize: Number(optional('GRAPH_PROJECTOR_BATCH_SIZE') ?? 25),
    maxAttempts: Number(optional('GRAPH_PROJECTOR_MAX_ATTEMPTS') ?? 5),
  };
}
