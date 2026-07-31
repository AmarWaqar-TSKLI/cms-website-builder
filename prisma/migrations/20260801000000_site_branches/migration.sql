-- A branch is a forked site that remembers its parent, so it can be diffed and
-- merged back. Additive and nullable: existing sites are trunk (parent NULL).
ALTER TABLE "sites" ADD COLUMN "parent_site_id" TEXT;
