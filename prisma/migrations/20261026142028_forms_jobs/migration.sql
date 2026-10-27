-- CreateEnum
CREATE TYPE "FormStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "JobKind" AS ENUM ('OVERDUE', 'UPCOMING', 'DIGEST');

-- CreateEnum
CREATE TYPE "JobFrequency" AS ENUM ('DAILY', 'WEEKDAYS', 'WEEKLY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "JobDelivery" AS ENUM ('INDIVIDUAL', 'DIGEST');

-- CreateEnum
CREATE TYPE "JobRunTrigger" AS ENUM ('TEST', 'MANUAL', 'SCHEDULED');

-- CreateEnum
CREATE TYPE "JobRunOutcome" AS ENUM ('COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "form_definitions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "status" "FormStatus" NOT NULL DEFAULT 'DRAFT',
    "currentVersion" INTEGER NOT NULL DEFAULT 0,
    "currentVersionId" TEXT,
    "fields" JSONB NOT NULL DEFAULT '[]',
    "settings" JSONB NOT NULL DEFAULT '{}',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT,
    "updatedById" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "form_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "form_versions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "fields" JSONB NOT NULL,
    "settings" JSONB NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedById" TEXT,
    "publishedByName" TEXT,

    CONSTRAINT "form_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scheduled_jobs" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "JobKind" NOT NULL,
    "targets" TEXT[],
    "scopeType" "ScopeType" NOT NULL DEFAULT 'COMPANY',
    "scopeId" TEXT,
    "frequency" "JobFrequency" NOT NULL DEFAULT 'DAILY',
    "weekday" INTEGER,
    "dayOfMonth" INTEGER,
    "runTime" TEXT NOT NULL DEFAULT '08:00',
    "timeZone" TEXT NOT NULL DEFAULT 'Europe/Dublin',
    "overdueDays" INTEGER NOT NULL DEFAULT 1,
    "upcomingDays" INTEGER NOT NULL DEFAULT 7,
    "recipients" JSONB NOT NULL,
    "delivery" "JobDelivery" NOT NULL DEFAULT 'INDIVIDUAL',
    "channels" TEXT[],
    "escalation" JSONB,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT,
    "lastRunAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scheduled_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_runs" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "jobName" TEXT NOT NULL,
    "trigger" "JobRunTrigger" NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "timeZone" TEXT NOT NULL,
    "localDate" TEXT NOT NULL,
    "outcome" "JobRunOutcome" NOT NULL,
    "matchedCount" INTEGER NOT NULL DEFAULT 0,
    "deliveredCount" INTEGER NOT NULL DEFAULT 0,
    "escalatedCount" INTEGER NOT NULL DEFAULT 0,
    "explanation" TEXT NOT NULL,
    "items" JSONB NOT NULL DEFAULT '[]',
    "triggeredById" TEXT,

    CONSTRAINT "job_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "form_definitions_organizationId_module_purpose_idx" ON "form_definitions"("organizationId", "module", "purpose");

-- CreateIndex
CREATE UNIQUE INDEX "form_definitions_organizationId_name_key" ON "form_definitions"("organizationId", "name");

-- CreateIndex
CREATE INDEX "form_versions_organizationId_module_purpose_idx" ON "form_versions"("organizationId", "module", "purpose");

-- CreateIndex
CREATE UNIQUE INDEX "form_versions_formId_version_key" ON "form_versions"("formId", "version");

-- CreateIndex
CREATE INDEX "scheduled_jobs_organizationId_enabled_idx" ON "scheduled_jobs"("organizationId", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "scheduled_jobs_organizationId_name_key" ON "scheduled_jobs"("organizationId", "name");

-- CreateIndex
CREATE INDEX "job_runs_organizationId_startedAt_idx" ON "job_runs"("organizationId", "startedAt");

-- CreateIndex
CREATE INDEX "job_runs_jobId_trigger_localDate_idx" ON "job_runs"("jobId", "trigger", "localDate");

-- AddForeignKey
ALTER TABLE "form_versions" ADD CONSTRAINT "form_versions_formId_fkey" FOREIGN KEY ("formId") REFERENCES "form_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_runs" ADD CONSTRAINT "job_runs_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "scheduled_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Published form versions are immutable: records keep the questions they captured.
-- (prevent_mutation_of_immutable_rows() comes from the init migration.)
DROP TRIGGER IF EXISTS form_versions_immutable ON "form_versions";
CREATE TRIGGER form_versions_immutable
  BEFORE UPDATE OR DELETE ON "form_versions"
  FOR EACH ROW EXECUTE FUNCTION prevent_mutation_of_immutable_rows();

DROP TRIGGER IF EXISTS form_versions_no_truncate ON "form_versions";
CREATE TRIGGER form_versions_no_truncate
  BEFORE TRUNCATE ON "form_versions"
  FOR EACH STATEMENT EXECUTE FUNCTION prevent_mutation_of_immutable_rows();
