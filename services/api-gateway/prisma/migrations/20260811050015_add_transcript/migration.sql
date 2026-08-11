-- CreateTable
CREATE TABLE "transcript" (
    "id" UUID NOT NULL,
    "evidence_id" UUID NOT NULL,
    "attachment_id" UUID NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'pending',
    "generated_text" TEXT,
    "edited_text" TEXT,
    "segments" JSONB NOT NULL DEFAULT '[]',
    "model" VARCHAR(100),
    "language" VARCHAR(50),
    "confirmed" BOOLEAN NOT NULL DEFAULT false,
    "failure_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "transcript_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "transcript_evidence_id_key" ON "transcript"("evidence_id");

-- AddForeignKey
ALTER TABLE "transcript" ADD CONSTRAINT "transcript_evidence_id_fkey" FOREIGN KEY ("evidence_id") REFERENCES "evidence"("id") ON DELETE CASCADE ON UPDATE CASCADE;
