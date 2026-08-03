-- CreateTable
CREATE TABLE "identity_link" (
    "id" UUID NOT NULL,
    "provider" VARCHAR(32) NOT NULL,
    "provider_subject" VARCHAR(255) NOT NULL,
    "user_id" UUID NOT NULL,
    "linked_at" TIMESTAMPTZ(6) NOT NULL,
    "last_sign_in_at" TIMESTAMPTZ(6),

    CONSTRAINT "identity_link_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "identity_link_provider_provider_subject_key" ON "identity_link"("provider", "provider_subject");

-- CreateIndex
CREATE INDEX "identity_link_user_id_idx" ON "identity_link"("user_id");

-- CreateTable
CREATE TABLE "auth_session" (
    "id" UUID NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "auth_session_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "auth_session_token_hash_key" ON "auth_session"("token_hash");

-- CreateIndex
CREATE INDEX "auth_session_user_id_idx" ON "auth_session"("user_id");

-- CreateIndex
CREATE INDEX "auth_session_expires_at_idx" ON "auth_session"("expires_at");

-- CreateTable
CREATE TABLE "auth_login_attempt" (
    "state" VARCHAR(64) NOT NULL,
    "nonce" VARCHAR(64) NOT NULL,
    "code_verifier" VARCHAR(128) NOT NULL,
    "redirect_uri" VARCHAR(500) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "auth_login_attempt_pkey" PRIMARY KEY ("state")
);

-- CreateIndex
CREATE INDEX "auth_login_attempt_expires_at_idx" ON "auth_login_attempt"("expires_at");

-- AddForeignKey
ALTER TABLE "identity_link" ADD CONSTRAINT "identity_link_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "witness_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_session" ADD CONSTRAINT "auth_session_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "witness_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
