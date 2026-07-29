-- CreateTable
CREATE TABLE "form_submissions" (
    "id" TEXT NOT NULL,
    "site_id" TEXT NOT NULL,
    "form_key" TEXT NOT NULL,
    "form_name" TEXT NOT NULL DEFAULT '',
    "data" JSONB NOT NULL,
    "email" TEXT,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "form_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "form_submissions_site_id_created_at_idx" ON "form_submissions"("site_id", "created_at");

-- AddForeignKey
ALTER TABLE "form_submissions" ADD CONSTRAINT "form_submissions_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;
