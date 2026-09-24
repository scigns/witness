-- CreateTable
CREATE TABLE "participant_capture_token" (
    "id" UUID NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "participant_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),

    CONSTRAINT "participant_capture_token_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "participant_capture_token_token_hash_key" ON "participant_capture_token"("token_hash");

-- CreateIndex
CREATE INDEX "participant_capture_token_participant_id_idx" ON "participant_capture_token"("participant_id");

-- CreateIndex
CREATE INDEX "participant_capture_token_expires_at_idx" ON "participant_capture_token"("expires_at");

-- AddForeignKey
ALTER TABLE "participant_capture_token" ADD CONSTRAINT "participant_capture_token_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "session_participant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
