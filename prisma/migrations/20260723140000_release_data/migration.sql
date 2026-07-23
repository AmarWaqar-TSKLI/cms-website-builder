-- ─────────────────────────────────────────────────────────────────────────────
-- release_data — the frozen side of Tier 2.
--
-- The runtime renders a release at request time rather than reading a file that
-- was written at publish time. That is only safe if rendering is a pure function
-- of immutable inputs, and Tier-2 data (products, prices, media) is by design
-- NOT immutable — it is live.
--
-- So the build job resolves it once and freezes the result here, before the
-- release is allowed to go live. Rendering then reads revisions plus this row,
-- all of which are append-only. Render the same release twice, a year apart, and
-- you get the same bytes.
--
-- This is the same data the old static artifact baked into its HTML. Moving it
-- into the database is what lets hosting stop depending on the filesystem while
-- keeping exactly the same semantics.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE "release_data" (
    "release_id" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "release_data_pkey" PRIMARY KEY ("release_id")
);

ALTER TABLE "release_data" ADD CONSTRAINT "release_data_release_id_fkey"
    FOREIGN KEY ("release_id") REFERENCES "releases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Same guard as the revision tables. A release's frozen data is an input the
-- build is a pure function of; if it could change, "immutable release" would be
-- a fiction and rollback would stop being reliable.
--
-- Note this permits INSERT and forbids UPDATE/DELETE, which is why a retried
-- build deletes nothing: it can only write this row if it is not already there,
-- and buildRelease refuses to touch a release that already has one.
CREATE TRIGGER release_data_append_only
  BEFORE UPDATE OR DELETE ON "release_data"
  FOR EACH ROW EXECUTE FUNCTION cms_forbid_mutation();
