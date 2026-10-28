-- CreateEnum
CREATE TYPE "LawRequirementKind" AS ENUM ('CONTENT', 'OTHER');

-- CreateEnum
CREATE TYPE "LawTaskPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "LawTaskStatus" AS ENUM ('OPEN', 'COMPLETED');

-- CreateTable
CREATE TABLE "law_content_versions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "releasedOn" DATE NOT NULL,
    "summary" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "changes" JSONB NOT NULL,
    "installedById" TEXT,
    "installedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "law_content_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "law_profiles" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "ownerId" TEXT NOT NULL,
    "jurisdiction" TEXT NOT NULL,
    "activities" TEXT[],
    "isShared" BOOLEAN NOT NULL DEFAULT true,
    "showRating" BOOLEAN NOT NULL DEFAULT true,
    "contentVersion" TEXT NOT NULL,
    "businessUnitId" TEXT,
    "siteId" TEXT,
    "locationId" TEXT,
    "departmentId" TEXT,
    "createdById" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "law_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "law_requirements" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "kind" "LawRequirementKind" NOT NULL,
    "contentKey" TEXT,
    "title" TEXT NOT NULL,
    "register" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "requirementText" TEXT NOT NULL DEFAULT '',
    "keywords" TEXT[],
    "isRelevant" BOOLEAN NOT NULL DEFAULT true,
    "exclusionReason" TEXT,
    "relevanceNotes" TEXT NOT NULL DEFAULT '',
    "evaluationNotes" TEXT NOT NULL DEFAULT '',
    "rating" INTEGER,
    "ownerId" TEXT,
    "nextReviewDate" DATE,
    "evaluatedOn" DATE,
    "reviewRequired" BOOLEAN NOT NULL DEFAULT false,
    "reviewReason" TEXT,
    "businessUnitId" TEXT,
    "siteId" TEXT,
    "locationId" TEXT,
    "departmentId" TEXT,
    "formId" TEXT,
    "formVersionId" TEXT,
    "form" JSONB,
    "answers" JSONB,
    "createdById" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "law_requirements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "law_tasks" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "requirementId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "details" TEXT NOT NULL DEFAULT '',
    "ownerId" TEXT NOT NULL,
    "priority" "LawTaskPriority" NOT NULL DEFAULT 'MEDIUM',
    "status" "LawTaskStatus" NOT NULL DEFAULT 'OPEN',
    "dueDate" DATE NOT NULL,
    "completedOn" DATE,
    "completedAt" TIMESTAMP(3),
    "completedById" TEXT,
    "completionNotes" TEXT,
    "businessUnitId" TEXT,
    "siteId" TEXT,
    "locationId" TEXT,
    "departmentId" TEXT,
    "createdById" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "law_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "law_links" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "requirementId" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "context" TEXT NOT NULL DEFAULT '',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "law_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "law_content_versions_organizationId_rank_idx" ON "law_content_versions"("organizationId", "rank");

-- CreateIndex
CREATE UNIQUE INDEX "law_content_versions_organizationId_version_key" ON "law_content_versions"("organizationId", "version");

-- CreateIndex
CREATE INDEX "law_profiles_organizationId_siteId_idx" ON "law_profiles"("organizationId", "siteId");

-- CreateIndex
CREATE INDEX "law_profiles_organizationId_ownerId_idx" ON "law_profiles"("organizationId", "ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "law_profiles_organizationId_name_key" ON "law_profiles"("organizationId", "name");

-- CreateIndex
CREATE INDEX "law_requirements_organizationId_profileId_idx" ON "law_requirements"("organizationId", "profileId");

-- CreateIndex
CREATE INDEX "law_requirements_organizationId_siteId_idx" ON "law_requirements"("organizationId", "siteId");

-- CreateIndex
CREATE INDEX "law_requirements_organizationId_ownerId_idx" ON "law_requirements"("organizationId", "ownerId");

-- CreateIndex
CREATE INDEX "law_requirements_organizationId_nextReviewDate_idx" ON "law_requirements"("organizationId", "nextReviewDate");

-- CreateIndex
CREATE UNIQUE INDEX "law_requirements_organizationId_reference_key" ON "law_requirements"("organizationId", "reference");

-- CreateIndex
CREATE UNIQUE INDEX "law_requirements_organizationId_profileId_contentKey_key" ON "law_requirements"("organizationId", "profileId", "contentKey");

-- CreateIndex
CREATE INDEX "law_tasks_organizationId_requirementId_idx" ON "law_tasks"("organizationId", "requirementId");

-- CreateIndex
CREATE INDEX "law_tasks_organizationId_siteId_idx" ON "law_tasks"("organizationId", "siteId");

-- CreateIndex
CREATE INDEX "law_tasks_organizationId_ownerId_status_idx" ON "law_tasks"("organizationId", "ownerId", "status");

-- CreateIndex
CREATE INDEX "law_tasks_organizationId_status_dueDate_idx" ON "law_tasks"("organizationId", "status", "dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "law_tasks_organizationId_reference_key" ON "law_tasks"("organizationId", "reference");

-- CreateIndex
CREATE INDEX "law_links_organizationId_targetType_targetId_idx" ON "law_links"("organizationId", "targetType", "targetId");

-- CreateIndex
CREATE UNIQUE INDEX "law_links_organizationId_requirementId_targetType_targetId_key" ON "law_links"("organizationId", "requirementId", "targetType", "targetId");

-- AddForeignKey
ALTER TABLE "law_requirements" ADD CONSTRAINT "law_requirements_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "law_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "law_tasks" ADD CONSTRAINT "law_tasks_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "law_requirements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "law_links" ADD CONSTRAINT "law_links_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "law_requirements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
