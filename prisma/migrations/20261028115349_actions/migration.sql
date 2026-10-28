-- CreateEnum
CREATE TYPE "ActionStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "actions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "clientId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "priority" "ActionPriority" NOT NULL DEFAULT 'NORMAL',
    "status" "ActionStatus" NOT NULL DEFAULT 'OPEN',
    "ownerId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "dueDate" DATE NOT NULL,
    "startedAt" TIMESTAMP(3),
    "completedOn" DATE,
    "completedAt" TIMESTAMP(3),
    "completedById" TEXT,
    "completionNotes" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelledById" TEXT,
    "cancelReason" TEXT,
    "businessUnitId" TEXT,
    "siteId" TEXT,
    "locationId" TEXT,
    "departmentId" TEXT,
    "formId" TEXT,
    "formVersionId" TEXT,
    "form" JSONB,
    "answers" JSONB,
    "version" INTEGER NOT NULL DEFAULT 1,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "actions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "actions_organizationId_siteId_idx" ON "actions"("organizationId", "siteId");

-- CreateIndex
CREATE INDEX "actions_organizationId_status_dueDate_idx" ON "actions"("organizationId", "status", "dueDate");

-- CreateIndex
CREATE INDEX "actions_organizationId_ownerId_status_idx" ON "actions"("organizationId", "ownerId", "status");

-- CreateIndex
CREATE INDEX "actions_organizationId_createdById_idx" ON "actions"("organizationId", "createdById");

-- CreateIndex
CREATE UNIQUE INDEX "actions_organizationId_reference_key" ON "actions"("organizationId", "reference");

-- CreateIndex
CREATE UNIQUE INDEX "actions_organizationId_clientId_key" ON "actions"("organizationId", "clientId");

-- Data (additive, idempotent): switch the new Actions module on for existing tenants and give the
-- system roles the new permission keys, matching src/lib/default-roles.ts. Roles an administrator
-- created are not touched; a key a role already holds is not added twice.
UPDATE "organizations"
SET "enabledModules" = array_append(COALESCE("enabledModules", '{}'), 'actions')
WHERE NOT ('actions' = ANY(COALESCE("enabledModules", '{}')));

UPDATE "roles"
SET "permissions" = array_append(COALESCE("permissions", '{}'), 'action.create'), "version" = "version" + 1, "updatedAt" = CURRENT_TIMESTAMP
WHERE "key" IN ('administrator', 'employee', 'manager', 'hr-admin', 'ehs-manager', 'ehs-investigator', 'auditor', 'inspector') AND NOT ('action.create' = ANY(COALESCE("permissions", '{}')));

UPDATE "roles"
SET "permissions" = array_append(COALESCE("permissions", '{}'), 'action.view'), "version" = "version" + 1, "updatedAt" = CURRENT_TIMESTAMP
WHERE "key" IN ('administrator', 'manager', 'ehs-manager') AND NOT ('action.view' = ANY(COALESCE("permissions", '{}')));

UPDATE "roles"
SET "permissions" = array_append(COALESCE("permissions", '{}'), 'action.manage'), "version" = "version" + 1, "updatedAt" = CURRENT_TIMESTAMP
WHERE "key" IN ('administrator', 'manager', 'ehs-manager') AND NOT ('action.manage' = ANY(COALESCE("permissions", '{}')));
