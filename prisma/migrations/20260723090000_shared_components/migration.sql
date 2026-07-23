-- ─────────────────────────────────────────────────────────────────────────────
-- SHARED COMPONENTS ("symbols")
--
-- One definition, many referencing pages. The unit of storage is a shared
-- component, NOT a node on a page — a page revision still holds its whole tree.
--
-- Everything here is a copy of the shape pages already use, on purpose: an
-- identity table with no content, an overwrite-only draft keyed by its parent's
-- id, and an append-only revision table under the same trigger. One versioning
-- story, applied to a second entity.
-- ─────────────────────────────────────────────────────────────────────────────

-- Two enum values are the entire cost of teaching the manifest and the reverse
-- dependency index about components. release_items.revision_id was left
-- polymorphic precisely so a third entity type would not need a schema redesign.
ALTER TYPE "EntityType" ADD VALUE 'component';
ALTER TYPE "RefType" ADD VALUE 'component';

CREATE TABLE "shared_components" (
    "id" TEXT NOT NULL,
    "site_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT NOT NULL DEFAULT '◈',
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shared_components_pkey" PRIMARY KEY ("id")
);

-- OVERWRITE-ONLY. component_id is the PRIMARY KEY, so "one draft per component"
-- is a database guarantee. Autosave hammers this row; it is crash protection,
-- not history.
CREATE TABLE "shared_component_drafts" (
    "component_id" TEXT NOT NULL,
    "body" JSONB NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT,
    "lock_version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "shared_component_drafts_pkey" PRIMARY KEY ("component_id")
);

-- APPEND-ONLY. One row per publish per component, holding the whole subtree.
CREATE TABLE "shared_component_revisions" (
    "id" TEXT NOT NULL,
    "component_id" TEXT NOT NULL,
    "body" JSONB NOT NULL,
    "version_no" INTEGER NOT NULL,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shared_component_revisions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "shared_components_site_id_idx" ON "shared_components"("site_id");
CREATE INDEX "shared_component_revisions_component_id_idx" ON "shared_component_revisions"("component_id");
CREATE UNIQUE INDEX "shared_component_revisions_component_id_version_no_key"
    ON "shared_component_revisions"("component_id", "version_no");

-- Same partial-unique trick as pages: a soft-deleted symbol must not keep
-- reserving its name.
CREATE UNIQUE INDEX "shared_components_site_id_name_active_key"
    ON "shared_components" ("site_id", "name") WHERE "deleted_at" IS NULL;

ALTER TABLE "shared_components" ADD CONSTRAINT "shared_components_site_id_fkey"
    FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "shared_component_drafts" ADD CONSTRAINT "shared_component_drafts_component_id_fkey"
    FOREIGN KEY ("component_id") REFERENCES "shared_components"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "shared_component_revisions" ADD CONSTRAINT "shared_component_revisions_component_id_fkey"
    FOREIGN KEY ("component_id") REFERENCES "shared_components"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The same guard page_revisions has, on the same function. Application code
-- cannot rewrite a published header even if it tries — which is precisely what
-- makes "roll back and Tuesday's header returns" a guarantee rather than a hope.
CREATE TRIGGER shared_component_revisions_append_only
  BEFORE UPDATE OR DELETE ON "shared_component_revisions"
  FOR EACH ROW EXECUTE FUNCTION cms_forbid_mutation();

