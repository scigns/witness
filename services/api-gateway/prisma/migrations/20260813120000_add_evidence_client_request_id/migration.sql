-- AlterTable
ALTER TABLE "evidence" ADD COLUMN     "client_request_id" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "evidence_session_id_client_request_id_key" ON "evidence"("session_id", "client_request_id");

