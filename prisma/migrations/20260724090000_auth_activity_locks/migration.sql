-- ─────────────────────────────────────────────────────────────────────────────
-- REAL USERS, AN AUDIT TRAIL, AND EDITING LOCKS
--
-- Auth was previously faked and said so. This replaces it with the real thing:
-- sessions, scrypt password hashes, and org-scoped access. Two features the
-- product needs depend on knowing who is asking — "who changed this?" and
-- "somebody else is editing this page" — and neither can be built on a fiction.
-- ─────────────────────────────────────────────────────────────────────────────

-- Existing rows have no name and a placeholder password. The seed replaces them;
-- the default here only exists so the column can be NOT NULL from the start.
ALTER TABLE "users" ADD COLUMN "name" TEXT NOT NULL DEFAULT 'Unnamed';
ALTER TABLE "users" ALTER COLUMN "name" DROP DEFAULT;

-- ── Sessions ────────────────────────────────────────────────────────────────
-- The primary key is a SHA-256 of the token in the cookie, never the token.
-- Reading this table therefore does not let anyone sign in as anybody, for the
-- same reason the password column holds a hash and not a password.
CREATE TABLE "sessions" (
    "token_hash"   TEXT NOT NULL,
    "user_id"      TEXT NOT NULL,
    "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at"   TIMESTAMP(3) NOT NULL,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_agent"   TEXT,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("token_hash")
);
CREATE INDEX "sessions_user_id_idx"    ON "sessions"("user_id");
CREATE INDEX "sessions_expires_at_idx" ON "sessions"("expires_at");
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Audit trail ─────────────────────────────────────────────────────────────
CREATE TABLE "activity_log" (
    "id"          TEXT NOT NULL,
    "site_id"     TEXT,
    "user_id"     TEXT,
    "actor_name"  TEXT NOT NULL,
    "action"      TEXT NOT NULL,
    "entity_type" TEXT,
    "entity_id"   TEXT,
    "summary"     TEXT NOT NULL,
    "meta"        JSONB,
    "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_log_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "activity_log_site_id_created_at_idx" ON "activity_log"("site_id", "created_at");
CREATE INDEX "activity_log_entity_type_entity_id_idx" ON "activity_log"("entity_type", "entity_id");
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_site_id_fkey"
    FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- SET NULL, not CASCADE: deleting a user must not delete the record of what they
-- did. `actor_name` was copied in at write time precisely so the entry still
-- reads correctly once the account is gone.
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- The same guard the revision tables have. An audit log that the application can
-- edit is not an audit log — it is a suggestion.
CREATE TRIGGER activity_log_append_only
  BEFORE UPDATE OR DELETE ON "activity_log"
  FOR EACH ROW EXECUTE FUNCTION cms_forbid_mutation();

-- ── Editing locks ───────────────────────────────────────────────────────────
-- page_id is the PRIMARY KEY, so "one editor per page" is a database guarantee
-- rather than something the application remembers to check. Two people opening
-- the same page at the same instant cannot both win: the second INSERT violates
-- the key, and that failure IS the answer.
CREATE TABLE "page_locks" (
    "page_id"      TEXT NOT NULL,
    "user_id"      TEXT NOT NULL,
    "acquired_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "heartbeat_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "page_locks_pkey" PRIMARY KEY ("page_id")
);
CREATE INDEX "page_locks_heartbeat_at_idx" ON "page_locks"("heartbeat_at");
ALTER TABLE "page_locks" ADD CONSTRAINT "page_locks_page_id_fkey"
    FOREIGN KEY ("page_id") REFERENCES "pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "page_locks" ADD CONSTRAINT "page_locks_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
