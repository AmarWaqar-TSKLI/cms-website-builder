-- Outbound publish webhooks: notified (HMAC-signed, best-effort) whenever a
-- site's live release changes — publish or rollback alike.
CREATE TABLE "webhooks" (
    "id" TEXT NOT NULL,
    "site_id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "created_by" TEXT,
    "disabled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhooks_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "webhooks_site_id_idx" ON "webhooks"("site_id");

ALTER TABLE "webhooks" ADD CONSTRAINT "webhooks_site_id_fkey"
    FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;
