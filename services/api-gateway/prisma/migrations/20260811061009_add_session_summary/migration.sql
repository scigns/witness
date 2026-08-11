-- CreateTable
CREATE TABLE "session_summary" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'pending',
    "source_evidence_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "generated_text" TEXT,
    "edited_text" TEXT,
    "model" VARCHAR(100),
    "confirmed" BOOLEAN NOT NULL DEFAULT false,
    "failure_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "session_summary_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "session_summary_session_id_key" ON "session_summary"("session_id");

-- AddForeignKey
ALTER TABLE "session_summary" ADD CONSTRAINT "session_summary_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "co_design_session"("id") ON DELETE CASCADE ON UPDATE CASCADE;
