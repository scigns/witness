-- CreateTable
CREATE TABLE "documentation_snapshot" (
    "id" UUID NOT NULL,
    "app_version" VARCHAR(32) NOT NULL,
    "doc_version" VARCHAR(32) NOT NULL,
    "index_version" INTEGER NOT NULL DEFAULT 1,
    "status" VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "documentation_snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documentation_chunk" (
    "id" UUID NOT NULL,
    "snapshot_id" UUID NOT NULL,
    "source_path" VARCHAR(500) NOT NULL,
    "source_anchor" VARCHAR(200),
    "title" VARCHAR(300) NOT NULL,
    "body" TEXT NOT NULL,
    "min_role_tier" VARCHAR(16) NOT NULL DEFAULT 'reader',
    "min_entitlement_key" VARCHAR(100),
    "last_updated_at" TIMESTAMPTZ(6) NOT NULL,
    "indexed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "documentation_chunk_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "documentation_snapshot_app_version_doc_version_index_versi_key"
    ON "documentation_snapshot"("app_version", "doc_version", "index_version");

-- CreateIndex
CREATE INDEX "documentation_snapshot_app_version_status_idx"
    ON "documentation_snapshot"("app_version", "status");

-- CreateIndex
CREATE INDEX "documentation_chunk_snapshot_id_idx" ON "documentation_chunk"("snapshot_id");

-- AddForeignKey
ALTER TABLE "documentation_chunk" ADD CONSTRAINT "documentation_chunk_snapshot_id_fkey"
    FOREIGN KEY ("snapshot_id") REFERENCES "documentation_snapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Generated full-text search column. Prisma models this as `Unsupported("tsvector")`
-- and cannot express a generated column declaratively, so it is added here by hand.
-- STORED (not VIRTUAL — Postgres only supports STORED) so the GIN index below can
-- use it directly.
ALTER TABLE "documentation_chunk"
    ADD COLUMN "search_vector" tsvector
    GENERATED ALWAYS AS (
        setweight(to_tsvector('english', coalesce("title", '')), 'A') ||
        setweight(to_tsvector('english', coalesce("body", '')), 'B')
    ) STORED;

-- CreateIndex
CREATE INDEX "documentation_chunk_search_vector_idx"
    ON "documentation_chunk" USING GIN ("search_vector");
