-- ─────────────────────────────────────────────────────────────────────────────
-- COMPONENTS BECOME THE UNIT OF STORAGE
--
-- Before: a page draft held the whole page as one JSON tree, and a *separate*
-- kind of record existed for the blocks someone had explicitly promoted to be
-- shared. Two mechanisms for the same idea.
--
-- After: there is one mechanism. Every top-level block on a page is a component
-- record with its own draft and its own revisions, and a page holds only an
-- ordered list of references to them.
--
-- The consequence worth stating: "shared" stops being a property of a record. A
-- component referenced by one page is an ordinary block. The same component
-- referenced by five pages is a shared header. Editing one changes exactly the
-- pages that point at it — by default, one.
--
-- Two steps below: rename the tables, then split the existing page bodies. Old
-- releases are deliberately NOT touched. They pinned page revisions that hold
-- inline trees, and those must keep rendering exactly as they did — which they
-- do, because expansion still renders an inline node inline.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Rename ────────────────────────────────────────────────────────────────
ALTER TABLE "shared_components"           RENAME TO "components";
ALTER TABLE "shared_component_drafts"     RENAME TO "component_drafts";
ALTER TABLE "shared_component_revisions"  RENAME TO "component_revisions";

ALTER TABLE "components"          RENAME CONSTRAINT "shared_components_pkey"          TO "components_pkey";
ALTER TABLE "component_drafts"    RENAME CONSTRAINT "shared_component_drafts_pkey"    TO "component_drafts_pkey";
ALTER TABLE "component_revisions" RENAME CONSTRAINT "shared_component_revisions_pkey" TO "component_revisions_pkey";

ALTER TABLE "components"          RENAME CONSTRAINT "shared_components_site_id_fkey"               TO "components_site_id_fkey";
ALTER TABLE "component_drafts"    RENAME CONSTRAINT "shared_component_drafts_component_id_fkey"    TO "component_drafts_component_id_fkey";
ALTER TABLE "component_revisions" RENAME CONSTRAINT "shared_component_revisions_component_id_fkey" TO "component_revisions_component_id_fkey";

ALTER INDEX "shared_components_site_id_idx"                          RENAME TO "components_site_id_idx";
ALTER INDEX "shared_component_revisions_component_id_idx"            RENAME TO "component_revisions_component_id_idx";
ALTER INDEX "shared_component_revisions_component_id_version_no_key" RENAME TO "component_revisions_component_id_version_no_key";
ALTER INDEX "shared_components_site_id_name_active_key"              RENAME TO "components_site_id_name_active_key";

-- The trigger follows the table, but its name should not lie about which one.
ALTER TRIGGER "shared_component_revisions_append_only" ON "component_revisions"
  RENAME TO "component_revisions_append_only";

-- ── 2. A name is now optional ────────────────────────────────────────────────
-- Naming a component is what puts it in the palette for reuse. A block dropped
-- onto a page is a component too, and needs no name at all.
ALTER TABLE "components" ALTER COLUMN "name" DROP NOT NULL;
ALTER TABLE "components" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'Section';

-- Unnamed components must not collide with each other, so the uniqueness only
-- applies where a name was actually given.
DROP INDEX "components_site_id_name_active_key";
CREATE UNIQUE INDEX "components_site_id_name_active_key"
  ON "components" ("site_id", "name")
  WHERE "deleted_at" IS NULL AND "name" IS NOT NULL;

-- Existing rows were all named, and their kind is whatever their first block is.
UPDATE "components" c
   SET "kind" = COALESCE(d."body"->'root'->0->>'type', 'Section')
  FROM "component_drafts" d
 WHERE d."component_id" = c."id";

-- ── 3. Split every existing page draft into components ───────────────────────
-- For each top-level block that is not ALREADY a reference, mint a component,
-- move the block into it, and leave a reference behind in the page.
DO $$
DECLARE
  draft    RECORD;
  element  JSONB;
  new_refs JSONB;
  new_id   TEXT;
BEGIN
  FOR draft IN
    SELECT pd."page_id", pd."body", pd."updated_by", p."site_id"
      FROM "page_drafts" pd
      JOIN "pages" p ON p."id" = pd."page_id"
  LOOP
    new_refs := '[]'::jsonb;

    FOR element IN SELECT * FROM jsonb_array_elements(COALESCE(draft."body"->'root', '[]'::jsonb))
    LOOP
      IF element->>'type' = '@component' THEN
        -- Already a reference. Carry it over untouched, overrides and all.
        new_refs := new_refs || jsonb_build_array(element);
      ELSE
        new_id := gen_random_uuid()::text;

        INSERT INTO "components" ("id", "site_id", "name", "kind", "icon", "created_at")
        VALUES (new_id, draft."site_id", NULL, COALESCE(element->>'type', 'Section'), '◈', now());

        INSERT INTO "component_drafts" ("component_id", "body", "updated_at", "updated_by", "lock_version")
        VALUES (
          new_id,
          jsonb_build_object('version', 1, 'root', jsonb_build_array(element)),
          now(),
          draft."updated_by",
          1
        );

        new_refs := new_refs || jsonb_build_array(jsonb_build_object(
          'id',       'ref-' || substr(new_id, 1, 8),
          'type',     '@component',
          'props',    jsonb_build_object('componentId', new_id, 'overrides', '{}'::jsonb),
          'children', '[]'::jsonb
        ));
      END IF;
    END LOOP;

    -- The page now holds the arrangement and nothing else.
    UPDATE "page_drafts"
       SET "body" = jsonb_build_object('version', 1, 'root', new_refs),
           "lock_version" = "lock_version" + 1,
           "updated_at" = now()
     WHERE "page_id" = draft."page_id";
  END LOOP;
END $$;
