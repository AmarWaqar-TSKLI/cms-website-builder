-- Invitations into an organisation. Only a SHA-256 of the invite token is
-- stored (same discipline as sessions and API keys); bound to an email and an
-- expiry, acceptance is a soft flag so the audit trail survives.
CREATE TABLE "invites" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'editor',
    "token_hash" TEXT NOT NULL,
    "created_by" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "accepted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invites_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "invites_token_hash_key" ON "invites"("token_hash");
CREATE INDEX "invites_org_id_idx" ON "invites"("org_id");

ALTER TABLE "invites" ADD CONSTRAINT "invites_org_id_fkey"
    FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
