-- Soft-delete for sites. Hard delete is impossible by design: revisions and the
-- activity log are append-only (a trigger forbids DELETE). Archiving instead.
ALTER TABLE "sites" ADD COLUMN "deleted_at" TIMESTAMP(3);
