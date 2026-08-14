-- AlterTable
ALTER TABLE "evidence_attachment" ADD COLUMN     "storage_key" VARCHAR(500),
ALTER COLUMN "content" DROP NOT NULL;

-- AlterTable
ALTER TABLE "resource" ADD COLUMN     "storage_key" VARCHAR(500);

