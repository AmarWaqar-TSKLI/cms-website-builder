-- Password-reset requests. Hash-only token, single use, short expiry — the
-- session/API-key discipline applied to account recovery.
CREATE TABLE "password_resets" (
    "token_hash" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_resets_pkey" PRIMARY KEY ("token_hash")
);

CREATE INDEX "password_resets_user_id_idx" ON "password_resets"("user_id");

ALTER TABLE "password_resets" ADD CONSTRAINT "password_resets_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
