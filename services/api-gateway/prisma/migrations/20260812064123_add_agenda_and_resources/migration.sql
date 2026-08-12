-- CreateTable
CREATE TABLE "agenda_item" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "session_id" UUID,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "prompt_text" TEXT,
    "facilitator_id" UUID,
    "status" VARCHAR(16) NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "start_at" TIMESTAMPTZ(6),
    "duration_minutes" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "agenda_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resource" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "session_id" UUID,
    "agenda_item_id" UUID,
    "title" VARCHAR(300) NOT NULL,
    "description" TEXT,
    "resource_type" VARCHAR(16) NOT NULL,
    "original_filename" VARCHAR(300),
    "content_type" VARCHAR(100),
    "size_bytes" INTEGER,
    "content" BYTEA,
    "external_url" VARCHAR(2000),
    "uploaded_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "resource_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "agenda_item_workspace_id_sort_order_idx" ON "agenda_item"("workspace_id", "sort_order");

-- CreateIndex
CREATE INDEX "agenda_item_session_id_idx" ON "agenda_item"("session_id");

-- CreateIndex
CREATE INDEX "resource_workspace_id_idx" ON "resource"("workspace_id");

-- CreateIndex
CREATE INDEX "resource_session_id_idx" ON "resource"("session_id");

-- CreateIndex
CREATE INDEX "resource_agenda_item_id_idx" ON "resource"("agenda_item_id");

-- AddForeignKey
ALTER TABLE "agenda_item" ADD CONSTRAINT "agenda_item_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agenda_item" ADD CONSTRAINT "agenda_item_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "co_design_session"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agenda_item" ADD CONSTRAINT "agenda_item_facilitator_id_fkey" FOREIGN KEY ("facilitator_id") REFERENCES "witness_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resource" ADD CONSTRAINT "resource_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resource" ADD CONSTRAINT "resource_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "co_design_session"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resource" ADD CONSTRAINT "resource_agenda_item_id_fkey" FOREIGN KEY ("agenda_item_id") REFERENCES "agenda_item"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resource" ADD CONSTRAINT "resource_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "witness_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
