-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "ClientStatus" AS ENUM ('active', 'paused', 'archived');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('active', 'paused', 'archived');

-- CreateEnum
CREATE TYPE "PermissionLevel" AS ENUM ('read_only', 'proposal_only', 'approved_writes');

-- CreateEnum
CREATE TYPE "CredentialType" AS ENUM ('wordpress_application_password', 'wordpress_oauth', 'rankmath_bridge_token', 'seranking_token');

-- CreateEnum
CREATE TYPE "OpportunityStatus" AS ENUM ('open', 'proposed', 'in_progress', 'closed', 'dismissed');

-- CreateEnum
CREATE TYPE "ChangeRequestStatus" AS ENUM ('proposed', 'approved', 'applied', 'verified', 'rejected', 'failed', 'rolled_back');

-- CreateEnum
CREATE TYPE "RiskLevel" AS ENUM ('low', 'medium', 'high', 'critical');

-- CreateTable
CREATE TABLE "clients" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "company_name" TEXT,
    "contact_email" TEXT,
    "status" "ClientStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "wordpress_url" TEXT NOT NULL,
    "wordpress_staging_url" TEXT,
    "seranking_project_id" TEXT,
    "language" TEXT NOT NULL DEFAULT 'es',
    "target_country" TEXT,
    "target_city" TEXT,
    "sector" TEXT,
    "business_type" TEXT,
    "seo_plugin" TEXT NOT NULL DEFAULT 'rank_math_pro',
    "builder" TEXT NOT NULL DEFAULT 'elementor',
    "permission_level" "PermissionLevel" NOT NULL DEFAULT 'read_only',
    "status" "ProjectStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_capabilities" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "can_read_wordpress" BOOLEAN NOT NULL DEFAULT true,
    "can_create_drafts" BOOLEAN NOT NULL DEFAULT false,
    "can_update_rankmath" BOOLEAN NOT NULL DEFAULT false,
    "can_update_elementor" BOOLEAN NOT NULL DEFAULT false,
    "can_publish" BOOLEAN NOT NULL DEFAULT false,
    "can_change_slugs" BOOLEAN NOT NULL DEFAULT false,
    "can_change_canonical" BOOLEAN NOT NULL DEFAULT false,
    "can_change_robots" BOOLEAN NOT NULL DEFAULT false,
    "requires_human_approval" BOOLEAN NOT NULL DEFAULT true,
    "requires_double_approval_for_high_risk" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_capabilities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_credentials" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "credential_type" "CredentialType" NOT NULL,
    "label" TEXT,
    "encrypted_payload" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "last_used_at" TIMESTAMP(3),

    CONSTRAINT "project_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "opportunities" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "source" TEXT,
    "url" TEXT,
    "keyword" TEXT,
    "opportunity_type" TEXT NOT NULL,
    "current_position" INTEGER,
    "previous_position" INTEGER,
    "search_volume" INTEGER,
    "intent" TEXT,
    "impact_score" DECIMAL(65,30),
    "ease_score" DECIMAL(65,30),
    "commercial_value_score" DECIMAL(65,30),
    "urgency_score" DECIMAL(65,30),
    "confidence_score" DECIMAL(65,30),
    "risk_score" DECIMAL(65,30),
    "priority_score" DECIMAL(65,30),
    "summary" TEXT NOT NULL,
    "recommended_action" TEXT,
    "status" "OpportunityStatus" NOT NULL DEFAULT 'open',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "opportunities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "change_requests" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "opportunity_id" UUID,
    "url" TEXT,
    "target_entity_type" TEXT NOT NULL,
    "target_entity_id" TEXT,
    "change_type" TEXT NOT NULL,
    "risk_level" "RiskLevel" NOT NULL,
    "status" "ChangeRequestStatus" NOT NULL DEFAULT 'proposed',
    "before_payload" JSONB,
    "after_payload" JSONB,
    "diff_payload" JSONB,
    "reason" TEXT,
    "expected_impact" TEXT,
    "requires_approval" BOOLEAN NOT NULL DEFAULT true,
    "approved_by" TEXT,
    "approved_at" TIMESTAMP(3),
    "applied_at" TIMESTAMP(3),
    "verified_at" TIMESTAMP(3),
    "rollback_payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "change_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "action_logs" (
    "id" UUID NOT NULL,
    "project_id" UUID,
    "change_request_id" UUID,
    "tool_name" TEXT,
    "action_type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "input_payload" JSONB,
    "output_payload" JSONB,
    "error_message" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "action_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reports" (
    "id" UUID NOT NULL,
    "project_id" UUID,
    "client_id" UUID,
    "report_type" TEXT NOT NULL,
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "content_markdown" TEXT NOT NULL,
    "metrics_payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "projects_client_id_idx" ON "projects"("client_id");

-- CreateIndex
CREATE INDEX "projects_status_idx" ON "projects"("status");

-- CreateIndex
CREATE UNIQUE INDEX "projects_domain_key" ON "projects"("domain");

-- CreateIndex
CREATE UNIQUE INDEX "project_capabilities_project_id_key" ON "project_capabilities"("project_id");

-- CreateIndex
CREATE INDEX "project_credentials_project_id_idx" ON "project_credentials"("project_id");

-- CreateIndex
CREATE INDEX "project_credentials_credential_type_idx" ON "project_credentials"("credential_type");

-- CreateIndex
CREATE INDEX "opportunities_project_id_idx" ON "opportunities"("project_id");

-- CreateIndex
CREATE INDEX "opportunities_status_idx" ON "opportunities"("status");

-- CreateIndex
CREATE INDEX "opportunities_priority_score_idx" ON "opportunities"("priority_score");

-- CreateIndex
CREATE INDEX "change_requests_project_id_idx" ON "change_requests"("project_id");

-- CreateIndex
CREATE INDEX "change_requests_opportunity_id_idx" ON "change_requests"("opportunity_id");

-- CreateIndex
CREATE INDEX "change_requests_status_idx" ON "change_requests"("status");

-- CreateIndex
CREATE INDEX "action_logs_project_id_idx" ON "action_logs"("project_id");

-- CreateIndex
CREATE INDEX "action_logs_change_request_id_idx" ON "action_logs"("change_request_id");

-- CreateIndex
CREATE INDEX "action_logs_tool_name_idx" ON "action_logs"("tool_name");

-- CreateIndex
CREATE INDEX "action_logs_created_at_idx" ON "action_logs"("created_at");

-- CreateIndex
CREATE INDEX "reports_project_id_idx" ON "reports"("project_id");

-- CreateIndex
CREATE INDEX "reports_client_id_idx" ON "reports"("client_id");

-- CreateIndex
CREATE INDEX "reports_report_type_idx" ON "reports"("report_type");

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_capabilities" ADD CONSTRAINT "project_capabilities_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_credentials" ADD CONSTRAINT "project_credentials_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "change_requests" ADD CONSTRAINT "change_requests_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "change_requests" ADD CONSTRAINT "change_requests_opportunity_id_fkey" FOREIGN KEY ("opportunity_id") REFERENCES "opportunities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "action_logs" ADD CONSTRAINT "action_logs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "action_logs" ADD CONSTRAINT "action_logs_change_request_id_fkey" FOREIGN KEY ("change_request_id") REFERENCES "change_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

