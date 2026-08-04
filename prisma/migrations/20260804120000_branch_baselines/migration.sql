-- The fork point. Written once when a branch is created; what upgrades the
-- branch diff from two-way (parent vs branch, can't tell who changed what) to
-- three-way (base vs parent vs branch → clean changes, parent advances, and
-- real conflicts). Cascades away with the branch.
CREATE TABLE "branch_baselines" (
    "branch_site_id" TEXT NOT NULL,
    "blocks" JSONB NOT NULL,
    "tokens" JSONB NOT NULL,
    "component_map" JSONB NOT NULL,
    "page_paths" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "branch_baselines_pkey" PRIMARY KEY ("branch_site_id")
);

ALTER TABLE "branch_baselines" ADD CONSTRAINT "branch_baselines_branch_site_id_fkey"
    FOREIGN KEY ("branch_site_id") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;
