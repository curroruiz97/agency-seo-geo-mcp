-- Blog Automation layer: per-site blog config (blog_config) + used-keyword
-- registry for anti-cannibalisation (blog_keywords_used).
-- Safe to run once via: prisma db execute --file <this> --schema prisma/schema.prisma

-- CreateTable
CREATE TABLE IF NOT EXISTS "blog_config" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "configured" BOOLEAN NOT NULL DEFAULT true,
    "sector" TEXT,
    "seed_keywords" TEXT[],
    "language" TEXT NOT NULL DEFAULT 'es-ES',
    "city" TEXT,
    "default_category_id" INTEGER,
    "default_author_id" INTEGER,
    "render_mode" TEXT NOT NULL DEFAULT 'theme-builder-single',
    "template_id" INTEGER,
    "template_type" TEXT,
    "template_name" TEXT,
    "min_images" INTEGER NOT NULL DEFAULT 4,
    "image_source" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "blog_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "blog_keywords_used" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "keyword" TEXT NOT NULL,
    "secondary" TEXT[],
    "post_id" TEXT,
    "title" TEXT,
    "slug" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "blog_keywords_used_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "blog_config_project_id_key" ON "blog_config"("project_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "blog_keywords_used_project_id_idx" ON "blog_keywords_used"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "blog_keywords_used_project_id_keyword_key" ON "blog_keywords_used"("project_id", "keyword");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "blog_config" ADD CONSTRAINT "blog_config_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "blog_keywords_used" ADD CONSTRAINT "blog_keywords_used_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
