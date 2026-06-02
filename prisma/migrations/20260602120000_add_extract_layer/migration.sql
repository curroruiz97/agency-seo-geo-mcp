-- Add the SE Ranking extract layer (7 tables + 4 enums) that schema.prisma
-- declares but the initial migration (20260513235000_init_project_registry) never created.

-- CreateEnum
CREATE TYPE "ExtractionStatus" AS ENUM ('pending', 'running', 'completed', 'failed');

-- CreateEnum
CREATE TYPE "ExtractionSource" AS ENUM ('seranking', 'wordpress', 'rankmath', 'gsc', 'ga', 'manual');

-- CreateEnum
CREATE TYPE "AuditSeverity" AS ENUM ('info', 'notice', 'warning', 'error', 'critical');

-- CreateEnum
CREATE TYPE "ContentDraftStatus" AS ENUM ('proposed', 'approved', 'generating', 'ready', 'published', 'rejected');

-- CreateTable
CREATE TABLE "extraction_runs" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "source" "ExtractionSource" NOT NULL,
    "status" "ExtractionStatus" NOT NULL DEFAULT 'pending',
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),
    "stats" JSONB,
    "error_message" TEXT,

    CONSTRAINT "extraction_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "keywords" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "keyword" TEXT NOT NULL,
    "search_volume" INTEGER,
    "difficulty" INTEGER,
    "intent" TEXT,
    "cpc" DECIMAL(65,30),
    "language" TEXT,
    "country" TEXT,
    "seranking_id" TEXT,
    "group_name" TEXT,
    "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "keywords_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "keyword_snapshots" (
    "id" UUID NOT NULL,
    "keyword_id" UUID NOT NULL,
    "captured_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "position" INTEGER,
    "previous_position" INTEGER,
    "url" TEXT,
    "device" TEXT,
    "location" TEXT,
    "change_vs_previous" INTEGER,
    "in_top_3" BOOLEAN NOT NULL DEFAULT false,
    "in_top_10" BOOLEAN NOT NULL DEFAULT false,
    "in_opportunity_window" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "keyword_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_findings" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "category" TEXT NOT NULL,
    "rule_code" TEXT NOT NULL,
    "severity" "AuditSeverity" NOT NULL,
    "url" TEXT,
    "message" TEXT NOT NULL,
    "details" JSONB,
    "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "audit_findings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "competitors" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "domain" TEXT NOT NULL,
    "visibility_score" DECIMAL(65,30),
    "shared_keywords" INTEGER,
    "exclusive_keywords" INTEGER,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "competitors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_gaps" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "competitor_id" UUID,
    "keyword" TEXT NOT NULL,
    "search_volume" INTEGER,
    "difficulty" INTEGER,
    "competitor_position" INTEGER,
    "our_position" INTEGER,
    "gap_type" TEXT NOT NULL,
    "detected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "content_gaps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_drafts" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "change_request_id" UUID,
    "topic" TEXT NOT NULL,
    "primary_keyword" TEXT NOT NULL,
    "secondary_keywords" TEXT[],
    "intent" TEXT,
    "target_url" TEXT,
    "outline" JSONB,
    "content_html" TEXT,
    "meta_title" TEXT,
    "meta_description" TEXT,
    "faq_schema" JSONB,
    "internal_links" JSONB,
    "status" "ContentDraftStatus" NOT NULL DEFAULT 'proposed',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "published_at" TIMESTAMP(3),
    "wp_post_id" TEXT,

    CONSTRAINT "content_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "extraction_runs_project_id_idx" ON "extraction_runs"("project_id");

-- CreateIndex
CREATE INDEX "extraction_runs_source_idx" ON "extraction_runs"("source");

-- CreateIndex
CREATE INDEX "extraction_runs_status_idx" ON "extraction_runs"("status");

-- CreateIndex
CREATE INDEX "keywords_project_id_idx" ON "keywords"("project_id");

-- CreateIndex
CREATE INDEX "keywords_seranking_id_idx" ON "keywords"("seranking_id");

-- CreateIndex
CREATE UNIQUE INDEX "keywords_project_id_keyword_key" ON "keywords"("project_id", "keyword");

-- CreateIndex
CREATE INDEX "keyword_snapshots_keyword_id_idx" ON "keyword_snapshots"("keyword_id");

-- CreateIndex
CREATE INDEX "keyword_snapshots_captured_at_idx" ON "keyword_snapshots"("captured_at");

-- CreateIndex
CREATE INDEX "keyword_snapshots_in_opportunity_window_idx" ON "keyword_snapshots"("in_opportunity_window");

-- CreateIndex
CREATE INDEX "audit_findings_project_id_idx" ON "audit_findings"("project_id");

-- CreateIndex
CREATE INDEX "audit_findings_severity_idx" ON "audit_findings"("severity");

-- CreateIndex
CREATE UNIQUE INDEX "audit_findings_project_id_rule_code_url_key" ON "audit_findings"("project_id", "rule_code", "url");

-- CreateIndex
CREATE INDEX "competitors_project_id_idx" ON "competitors"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "competitors_project_id_domain_key" ON "competitors"("project_id", "domain");

-- CreateIndex
CREATE INDEX "content_gaps_project_id_idx" ON "content_gaps"("project_id");

-- CreateIndex
CREATE INDEX "content_gaps_competitor_id_idx" ON "content_gaps"("competitor_id");

-- CreateIndex
CREATE UNIQUE INDEX "content_drafts_change_request_id_key" ON "content_drafts"("change_request_id");

-- CreateIndex
CREATE INDEX "content_drafts_project_id_idx" ON "content_drafts"("project_id");

-- CreateIndex
CREATE INDEX "content_drafts_status_idx" ON "content_drafts"("status");

-- AddForeignKey
ALTER TABLE "keyword_snapshots" ADD CONSTRAINT "keyword_snapshots_keyword_id_fkey" FOREIGN KEY ("keyword_id") REFERENCES "keywords"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_gaps" ADD CONSTRAINT "content_gaps_competitor_id_fkey" FOREIGN KEY ("competitor_id") REFERENCES "competitors"("id") ON DELETE SET NULL ON UPDATE CASCADE;
