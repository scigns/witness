-- Invitation mail is a notification record, not an authorization primitive.
CREATE TABLE "invitation_notification" (
    "id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "membership_id" UUID NOT NULL,
    "recipient_email" VARCHAR(320) NOT NULL,
    "status" VARCHAR(16) NOT NULL,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "last_error" VARCHAR(500),
    "sent_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "invitation_notification_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "invitation_notification_organisation_id_user_id_key"
    ON "invitation_notification"("organisation_id", "user_id");
CREATE INDEX "invitation_notification_status_updated_at_idx"
    ON "invitation_notification"("status", "updated_at");
ALTER TABLE "invitation_notification"
    ADD CONSTRAINT "invitation_notification_organisation_id_fkey"
    FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "invitation_notification"
    ADD CONSTRAINT "invitation_notification_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "witness_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "invitation_notification"
    ADD CONSTRAINT "invitation_notification_membership_id_fkey"
    FOREIGN KEY ("membership_id") REFERENCES "organisation_membership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
