-- CreateEnum
CREATE TYPE "RiskAssessmentStatus" AS ENUM ('DRAFT', 'AWAITING_APPROVAL', 'APPROVED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "RiskRevisionAction" AS ENUM ('APPROVED', 'TASK_RESCORE');

-- CreateEnum
CREATE TYPE "RiskTargetDirection" AS ENUM ('INCREASE', 'DECREASE');

-- CreateEnum
CREATE TYPE "RiskStrategyStatus" AS ENUM ('ACTIVE', 'COMPLETED');

-- CreateEnum
CREATE TYPE "RiskProgrammeStatus" AS ENUM ('PLANNED', 'ACTIVE', 'COMPLETED');

-- CreateEnum
CREATE TYPE "RiskTaskKind" AS ENUM ('RA', 'MP');

-- CreateEnum
CREATE TYPE "RiskTaskStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'COMPLETED');

-- CreateTable
CREATE TABLE "risk_assessments" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "labelId" TEXT NOT NULL,
    "clientId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "businessUnitId" TEXT,
    "siteId" TEXT,
    "locationId" TEXT,
    "departmentId" TEXT,
    "ownerId" TEXT,
    "approverId" TEXT,
    "reviewDate" DATE,
    "participantIds" TEXT[],
    "itemType" TEXT,
    "itemIdentity" TEXT,
    "operationMode" TEXT,
    "workArea" TEXT,
    "peopleExposed" TEXT,
    "impactContext" TEXT,
    "status" "RiskAssessmentStatus" NOT NULL DEFAULT 'DRAFT',
    "revision" INTEGER NOT NULL DEFAULT 0,
    "form" JSONB NOT NULL,
    "formVersionId" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "rules" JSONB NOT NULL,
    "answers" JSONB NOT NULL DEFAULT '{}',
    "currentScore" INTEGER,
    "band" TEXT,
    "isConfidential" BOOLEAN NOT NULL DEFAULT false,
    "submittedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "lastReviewedAt" DATE,
    "archivedAt" TIMESTAMP(3),
    "clonedFromId" TEXT,
    "createdById" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "risk_assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "risk_hazards" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "activity" TEXT NOT NULL DEFAULT '',
    "name" TEXT NOT NULL DEFAULT '',
    "consequence" TEXT NOT NULL DEFAULT '',
    "controls" TEXT NOT NULL DEFAULT '',
    "recommendation" TEXT,
    "justification" TEXT NOT NULL DEFAULT '',
    "likelihood" INTEGER,
    "severity" INTEGER,
    "factors" JSONB,
    "checklistResult" TEXT,
    "score" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "risk_hazards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "risk_revisions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "action" "RiskRevisionAction" NOT NULL,
    "comment" TEXT,
    "score" INTEGER,
    "band" TEXT,
    "hazards" JSONB NOT NULL,
    "taskId" TEXT,
    "taskReference" TEXT,
    "actorId" TEXT,
    "actorName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "risk_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "risk_reviews" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "reviewDate" DATE NOT NULL,
    "comment" TEXT NOT NULL,
    "nextReviewDate" DATE NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "reviewerName" TEXT,
    "revision" INTEGER NOT NULL,
    "score" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "risk_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "risk_objectives" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "domain" TEXT,
    "businessUnitId" TEXT,
    "siteId" TEXT,
    "locationId" TEXT,
    "departmentId" TEXT,
    "ownerId" TEXT NOT NULL,
    "deadline" DATE NOT NULL,
    "description" TEXT,
    "status" "RiskStrategyStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdById" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "risk_objectives_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "risk_targets" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "objectiveId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "deadline" DATE NOT NULL,
    "direction" "RiskTargetDirection" NOT NULL,
    "unit" TEXT NOT NULL,
    "baseline" DOUBLE PRECISION NOT NULL,
    "current" DOUBLE PRECISION NOT NULL,
    "goal" DOUBLE PRECISION NOT NULL,
    "status" "RiskStrategyStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdById" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "risk_targets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "risk_programmes" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "objectiveId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "businessUnitId" TEXT,
    "siteId" TEXT,
    "locationId" TEXT,
    "departmentId" TEXT,
    "ownerId" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "deadline" DATE NOT NULL,
    "means" TEXT,
    "budget" DOUBLE PRECISION,
    "status" "RiskProgrammeStatus" NOT NULL DEFAULT 'PLANNED',
    "createdById" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "risk_programmes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "risk_programme_targets" (
    "organizationId" TEXT NOT NULL,
    "programmeId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,

    CONSTRAINT "risk_programme_targets_pkey" PRIMARY KEY ("programmeId","targetId")
);

-- CreateTable
CREATE TABLE "risk_tasks" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "kind" "RiskTaskKind" NOT NULL,
    "title" TEXT NOT NULL,
    "info" TEXT,
    "ownerId" TEXT NOT NULL,
    "createdOn" DATE NOT NULL,
    "dueDate" DATE NOT NULL,
    "programmeId" TEXT NOT NULL,
    "assessmentId" TEXT,
    "hazardId" TEXT,
    "factor" TEXT,
    "originalValue" INTEGER,
    "targetValue" INTEGER,
    "actualValue" INTEGER,
    "parentId" TEXT,
    "status" "RiskTaskStatus" NOT NULL DEFAULT 'OPEN',
    "completionComment" TEXT,
    "completedOn" DATE,
    "completedAt" TIMESTAMP(3),
    "completedById" TEXT,
    "businessUnitId" TEXT,
    "siteId" TEXT,
    "locationId" TEXT,
    "departmentId" TEXT,
    "createdById" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "risk_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "risk_assessments_clientId_key" ON "risk_assessments"("clientId");

-- CreateIndex
CREATE INDEX "risk_assessments_organizationId_siteId_idx" ON "risk_assessments"("organizationId", "siteId");

-- CreateIndex
CREATE INDEX "risk_assessments_organizationId_status_idx" ON "risk_assessments"("organizationId", "status");

-- CreateIndex
CREATE INDEX "risk_assessments_organizationId_reviewDate_idx" ON "risk_assessments"("organizationId", "reviewDate");

-- CreateIndex
CREATE INDEX "risk_assessments_ownerId_idx" ON "risk_assessments"("ownerId");

-- CreateIndex
CREATE INDEX "risk_assessments_approverId_idx" ON "risk_assessments"("approverId");

-- CreateIndex
CREATE UNIQUE INDEX "risk_assessments_organizationId_reference_key" ON "risk_assessments"("organizationId", "reference");

-- CreateIndex
CREATE UNIQUE INDEX "risk_assessments_organizationId_labelId_key" ON "risk_assessments"("organizationId", "labelId");

-- CreateIndex
CREATE INDEX "risk_hazards_organizationId_assessmentId_idx" ON "risk_hazards"("organizationId", "assessmentId");

-- CreateIndex
CREATE INDEX "risk_revisions_organizationId_date_idx" ON "risk_revisions"("organizationId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "risk_revisions_assessmentId_revision_key" ON "risk_revisions"("assessmentId", "revision");

-- CreateIndex
CREATE INDEX "risk_reviews_organizationId_reviewDate_idx" ON "risk_reviews"("organizationId", "reviewDate");

-- CreateIndex
CREATE INDEX "risk_reviews_assessmentId_idx" ON "risk_reviews"("assessmentId");

-- CreateIndex
CREATE INDEX "risk_objectives_organizationId_siteId_idx" ON "risk_objectives"("organizationId", "siteId");

-- CreateIndex
CREATE INDEX "risk_objectives_ownerId_idx" ON "risk_objectives"("ownerId");

-- CreateIndex
CREATE INDEX "risk_targets_organizationId_objectiveId_idx" ON "risk_targets"("organizationId", "objectiveId");

-- CreateIndex
CREATE INDEX "risk_targets_ownerId_idx" ON "risk_targets"("ownerId");

-- CreateIndex
CREATE INDEX "risk_programmes_organizationId_siteId_idx" ON "risk_programmes"("organizationId", "siteId");

-- CreateIndex
CREATE INDEX "risk_programmes_organizationId_objectiveId_idx" ON "risk_programmes"("organizationId", "objectiveId");

-- CreateIndex
CREATE INDEX "risk_programmes_ownerId_idx" ON "risk_programmes"("ownerId");

-- CreateIndex
CREATE INDEX "risk_programme_targets_organizationId_targetId_idx" ON "risk_programme_targets"("organizationId", "targetId");

-- CreateIndex
CREATE INDEX "risk_tasks_organizationId_siteId_idx" ON "risk_tasks"("organizationId", "siteId");

-- CreateIndex
CREATE INDEX "risk_tasks_organizationId_status_idx" ON "risk_tasks"("organizationId", "status");

-- CreateIndex
CREATE INDEX "risk_tasks_programmeId_idx" ON "risk_tasks"("programmeId");

-- CreateIndex
CREATE INDEX "risk_tasks_assessmentId_idx" ON "risk_tasks"("assessmentId");

-- CreateIndex
CREATE INDEX "risk_tasks_parentId_idx" ON "risk_tasks"("parentId");

-- CreateIndex
CREATE INDEX "risk_tasks_ownerId_idx" ON "risk_tasks"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "risk_tasks_organizationId_reference_key" ON "risk_tasks"("organizationId", "reference");

-- AddForeignKey
ALTER TABLE "risk_hazards" ADD CONSTRAINT "risk_hazards_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "risk_assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risk_revisions" ADD CONSTRAINT "risk_revisions_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "risk_assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risk_reviews" ADD CONSTRAINT "risk_reviews_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "risk_assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risk_targets" ADD CONSTRAINT "risk_targets_objectiveId_fkey" FOREIGN KEY ("objectiveId") REFERENCES "risk_objectives"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risk_programmes" ADD CONSTRAINT "risk_programmes_objectiveId_fkey" FOREIGN KEY ("objectiveId") REFERENCES "risk_objectives"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risk_programme_targets" ADD CONSTRAINT "risk_programme_targets_programmeId_fkey" FOREIGN KEY ("programmeId") REFERENCES "risk_programmes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risk_programme_targets" ADD CONSTRAINT "risk_programme_targets_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "risk_targets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risk_tasks" ADD CONSTRAINT "risk_tasks_programmeId_fkey" FOREIGN KEY ("programmeId") REFERENCES "risk_programmes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risk_tasks" ADD CONSTRAINT "risk_tasks_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "risk_assessments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risk_tasks" ADD CONSTRAINT "risk_tasks_hazardId_fkey" FOREIGN KEY ("hazardId") REFERENCES "risk_hazards"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risk_tasks" ADD CONSTRAINT "risk_tasks_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "risk_tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
