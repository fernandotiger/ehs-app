-- CreateEnum
CREATE TYPE "IncidentSeverity" AS ENUM ('MINOR', 'MAJOR', 'CRITICAL');

-- CreateEnum
CREATE TYPE "IncidentStatus" AS ENUM ('DRAFT', 'OPEN', 'INVESTIGATING', 'ACTION_REQUIRED', 'ACTION_IN_PROGRESS', 'AWAITING_EFFECTIVENESS', 'FOLLOW_UP_REQUIRED', 'READY_TO_CLOSE', 'CLOSED');

-- CreateEnum
CREATE TYPE "InvestigationStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED');

-- CreateEnum
CREATE TYPE "ActionKind" AS ENUM ('CORRECTIVE', 'PREVENTIVE');

-- CreateEnum
CREATE TYPE "ActionState" AS ENUM ('OPEN', 'IN_PROGRESS', 'AWAITING_EFFECTIVENESS', 'EFFECTIVE', 'INEFFECTIVE');

-- CreateEnum
CREATE TYPE "ActionPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateTable
CREATE TABLE "incident_types" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "multipleInvestigators" BOOLEAN NOT NULL DEFAULT true,
    "assignmentRequired" BOOLEAN NOT NULL DEFAULT true,
    "investigationEnabled" BOOLEAN NOT NULL DEFAULT true,
    "investigationRequired" BOOLEAN NOT NULL DEFAULT true,
    "defaultConfidential" BOOLEAN NOT NULL DEFAULT false,
    "attachmentsAllowed" BOOLEAN NOT NULL DEFAULT true,
    "targetDays" INTEGER NOT NULL DEFAULT 7,
    "reportFormId" TEXT,
    "investigationFormId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "incident_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incident_subtypes" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "typeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "incident_subtypes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incidents" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "clientId" TEXT,
    "typeId" TEXT NOT NULL,
    "typeLabel" TEXT NOT NULL,
    "subtypeId" TEXT,
    "subtypeLabel" TEXT,
    "title" TEXT NOT NULL,
    "narrative" TEXT,
    "severity" "IncidentSeverity" NOT NULL DEFAULT 'MINOR',
    "businessUnitId" TEXT,
    "siteId" TEXT,
    "locationId" TEXT,
    "departmentId" TEXT,
    "preciseLocation" TEXT,
    "shift" TEXT,
    "occurredAt" TIMESTAMP(3),
    "investigationTargetDate" DATE,
    "isConfidential" BOOLEAN NOT NULL DEFAULT false,
    "isDraft" BOOLEAN NOT NULL DEFAULT true,
    "submittedAt" TIMESTAMP(3),
    "reporterId" TEXT NOT NULL,
    "immediateAction" TEXT,
    "firstAid" TEXT,
    "nurseNotified" BOOLEAN NOT NULL DEFAULT false,
    "notifyUserIds" TEXT[],
    "reportForm" JSONB,
    "answers" JSONB NOT NULL DEFAULT '{}',
    "searchText" TEXT NOT NULL DEFAULT '',
    "closedAt" TIMESTAMP(3),
    "closedById" TEXT,
    "closureNote" TEXT,
    "archivedAt" TIMESTAMP(3),
    "status" "IncidentStatus" NOT NULL DEFAULT 'DRAFT',
    "sourceType" TEXT,
    "sourceId" TEXT,
    "sourceKey" TEXT,
    "sourceLabel" TEXT,
    "sourceHref" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "incidents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incident_people" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "userId" TEXT,
    "personType" TEXT NOT NULL,
    "involvement" TEXT NOT NULL,
    "injuryDetails" TEXT,
    "injuryType" TEXT,
    "bodyPart" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "incident_people_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incident_investigators" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "incident_investigators_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "investigations" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "status" "InvestigationStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "investigatorId" TEXT,
    "form" JSONB,
    "answers" JSONB NOT NULL DEFAULT '{}',
    "healthSafetyImpact" BOOLEAN NOT NULL DEFAULT false,
    "hazardGroup" TEXT,
    "environmentalImpact" BOOLEAN NOT NULL DEFAULT false,
    "environmentalAspect" TEXT,
    "environmentalDescription" TEXT,
    "environmentalDuration" DOUBLE PRECISION,
    "environmentalDurationUnit" TEXT,
    "causeIds" TEXT[],
    "reportable" BOOLEAN NOT NULL DEFAULT false,
    "reporteeIds" TEXT[],
    "operatingHoursLost" DOUBLE PRECISION,
    "actionsRequired" BOOLEAN,
    "closingDecision" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedById" TEXT,
    "completedAt" TIMESTAMP(3),
    "completedById" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "investigations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "absence_periods" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "investigationId" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "kind" TEXT NOT NULL,
    "restricted" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "absence_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "corrective_actions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "kind" "ActionKind" NOT NULL DEFAULT 'CORRECTIVE',
    "ownerId" TEXT NOT NULL,
    "businessUnitId" TEXT,
    "siteId" TEXT,
    "locationId" TEXT,
    "departmentId" TEXT,
    "dueDate" DATE NOT NULL,
    "priority" "ActionPriority" NOT NULL DEFAULT 'NORMAL',
    "capaCategory" TEXT,
    "reviewerId" TEXT,
    "plannedReviewDate" DATE,
    "state" "ActionState" NOT NULL DEFAULT 'OPEN',
    "completionComment" TEXT,
    "completedAt" TIMESTAMP(3),
    "completedById" TEXT,
    "reviewComment" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "parentActionId" TEXT,
    "sourceType" TEXT,
    "sourceId" TEXT,
    "sourceKey" TEXT,
    "sourceLabel" TEXT,
    "sourceHref" TEXT,
    "trend" JSONB,
    "createdById" TEXT,
    "archivedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "corrective_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "action_incidents" (
    "organizationId" TEXT NOT NULL,
    "actionId" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "linkedById" TEXT,
    "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "action_incidents_pkey" PRIMARY KEY ("actionId","incidentId")
);

-- CreateTable
CREATE TABLE "action_tasks" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "actionId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "businessUnitId" TEXT,
    "siteId" TEXT,
    "locationId" TEXT,
    "departmentId" TEXT,
    "dueDate" DATE NOT NULL,
    "priority" "ActionPriority" NOT NULL DEFAULT 'NORMAL',
    "done" BOOLEAN NOT NULL DEFAULT false,
    "completionComment" TEXT,
    "completedAt" TIMESTAMP(3),
    "completedById" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "action_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "incident_types_organizationId_key_key" ON "incident_types"("organizationId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "incident_types_organizationId_name_key" ON "incident_types"("organizationId", "name");

-- CreateIndex
CREATE INDEX "incident_subtypes_organizationId_typeId_idx" ON "incident_subtypes"("organizationId", "typeId");

-- CreateIndex
CREATE UNIQUE INDEX "incident_subtypes_typeId_name_key" ON "incident_subtypes"("typeId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "incidents_clientId_key" ON "incidents"("clientId");

-- CreateIndex
CREATE INDEX "incidents_organizationId_siteId_idx" ON "incidents"("organizationId", "siteId");

-- CreateIndex
CREATE INDEX "incidents_organizationId_status_idx" ON "incidents"("organizationId", "status");

-- CreateIndex
CREATE INDEX "incidents_organizationId_occurredAt_idx" ON "incidents"("organizationId", "occurredAt");

-- CreateIndex
CREATE INDEX "incidents_organizationId_typeId_idx" ON "incidents"("organizationId", "typeId");

-- CreateIndex
CREATE INDEX "incidents_reporterId_idx" ON "incidents"("reporterId");

-- CreateIndex
CREATE UNIQUE INDEX "incidents_organizationId_reference_key" ON "incidents"("organizationId", "reference");

-- CreateIndex
CREATE INDEX "incident_people_organizationId_incidentId_idx" ON "incident_people"("organizationId", "incidentId");

-- CreateIndex
CREATE INDEX "incident_investigators_organizationId_userId_idx" ON "incident_investigators"("organizationId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "incident_investigators_incidentId_userId_key" ON "incident_investigators"("incidentId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "investigations_incidentId_key" ON "investigations"("incidentId");

-- CreateIndex
CREATE INDEX "investigations_organizationId_status_idx" ON "investigations"("organizationId", "status");

-- CreateIndex
CREATE INDEX "absence_periods_organizationId_investigationId_idx" ON "absence_periods"("organizationId", "investigationId");

-- CreateIndex
CREATE INDEX "corrective_actions_organizationId_siteId_idx" ON "corrective_actions"("organizationId", "siteId");

-- CreateIndex
CREATE INDEX "corrective_actions_organizationId_state_idx" ON "corrective_actions"("organizationId", "state");

-- CreateIndex
CREATE INDEX "corrective_actions_ownerId_idx" ON "corrective_actions"("ownerId");

-- CreateIndex
CREATE INDEX "corrective_actions_reviewerId_idx" ON "corrective_actions"("reviewerId");

-- CreateIndex
CREATE INDEX "corrective_actions_parentActionId_idx" ON "corrective_actions"("parentActionId");

-- CreateIndex
CREATE UNIQUE INDEX "corrective_actions_organizationId_reference_key" ON "corrective_actions"("organizationId", "reference");

-- CreateIndex
CREATE INDEX "action_incidents_organizationId_incidentId_idx" ON "action_incidents"("organizationId", "incidentId");

-- CreateIndex
CREATE INDEX "action_tasks_organizationId_actionId_idx" ON "action_tasks"("organizationId", "actionId");

-- CreateIndex
CREATE INDEX "action_tasks_organizationId_siteId_idx" ON "action_tasks"("organizationId", "siteId");

-- CreateIndex
CREATE INDEX "action_tasks_ownerId_idx" ON "action_tasks"("ownerId");

-- AddForeignKey
ALTER TABLE "incident_subtypes" ADD CONSTRAINT "incident_subtypes_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "incident_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "incident_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_subtypeId_fkey" FOREIGN KEY ("subtypeId") REFERENCES "incident_subtypes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_people" ADD CONSTRAINT "incident_people_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_investigators" ADD CONSTRAINT "incident_investigators_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_investigators" ADD CONSTRAINT "incident_investigators_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investigations" ADD CONSTRAINT "investigations_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investigations" ADD CONSTRAINT "investigations_investigatorId_fkey" FOREIGN KEY ("investigatorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "absence_periods" ADD CONSTRAINT "absence_periods_investigationId_fkey" FOREIGN KEY ("investigationId") REFERENCES "investigations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "corrective_actions" ADD CONSTRAINT "corrective_actions_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "corrective_actions" ADD CONSTRAINT "corrective_actions_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "corrective_actions" ADD CONSTRAINT "corrective_actions_parentActionId_fkey" FOREIGN KEY ("parentActionId") REFERENCES "corrective_actions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "action_incidents" ADD CONSTRAINT "action_incidents_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "corrective_actions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "action_incidents" ADD CONSTRAINT "action_incidents_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "action_tasks" ADD CONSTRAINT "action_tasks_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "corrective_actions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "action_tasks" ADD CONSTRAINT "action_tasks_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
