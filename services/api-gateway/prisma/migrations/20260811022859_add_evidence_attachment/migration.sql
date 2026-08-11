-- CreateTable
CREATE TABLE "evidence_attachment" (
    "id" UUID NOT NULL,
    "evidence_id" UUID NOT NULL,
    "kind" VARCHAR(16) NOT NULL,
    "original_filename" VARCHAR(300) NOT NULL,
    "content_type" VARCHAR(100) NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "checksum_sha256" VARCHAR(64) NOT NULL,
    "content" BYTEA NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evidence_attachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "evidence_attachment_evidence_id_key" ON "evidence_attachment"("evidence_id");

-- AddForeignKey
ALTER TABLE "evidence_attachment" ADD CONSTRAINT "evidence_attachment_evidence_id_fkey" FOREIGN KEY ("evidence_id") REFERENCES "evidence"("id") ON DELETE CASCADE ON UPDATE CASCADE;
