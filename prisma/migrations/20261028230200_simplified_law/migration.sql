-- CreateEnum
CREATE TYPE "SlawLegalStatus" AS ENUM ('ACTIVE', 'AFFECTED', 'SUPERSEDED', 'REPEALED');

-- CreateEnum
CREATE TYPE "SlawApplicability" AS ENUM ('NOT_CHECKED', 'APPLIES', 'DOES_NOT_APPLY');

-- CreateEnum
CREATE TYPE "SlawAnswer" AS ENUM ('YES', 'NO');

-- CreateEnum
CREATE TYPE "SlawCompliance" AS ENUM ('NOT_ASSESSED', 'COMPLIANT', 'NOT_COMPLIANT', 'NOT_APPLICABLE');

-- CreateEnum
CREATE TYPE "SlawActionStatus" AS ENUM ('NONE', 'OPEN', 'DONE');

-- CreateTable
CREATE TABLE "slaw_settings" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "registerTitle" TEXT NOT NULL DEFAULT 'Legislation & Compliance Register',
    "jurisdictions" TEXT[] DEFAULT ARRAY['EU', 'Ireland']::TEXT[],
    "statusLabels" JSONB,
    "hideRepealed" BOOLEAN NOT NULL DEFAULT true,
    "defaultActionDays" INTEGER NOT NULL DEFAULT 30,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "slaw_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "slaw_categories" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "parentId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "slaw_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "slaw_legislation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "shortTitle" TEXT NOT NULL DEFAULT '',
    "reference" TEXT NOT NULL DEFAULT '',
    "jurisdiction" TEXT NOT NULL,
    "status" "SlawLegalStatus" NOT NULL DEFAULT 'ACTIVE',
    "kindLabel" TEXT NOT NULL DEFAULT '',
    "relationNote" TEXT NOT NULL DEFAULT '',
    "summary" TEXT NOT NULL DEFAULT '',
    "officialUrl" TEXT,
    "guidanceUrl" TEXT,
    "applicability" "SlawApplicability" NOT NULL DEFAULT 'NOT_CHECKED',
    "applicabilityReason" TEXT NOT NULL DEFAULT '',
    "applicabilityById" TEXT,
    "applicabilityAt" TIMESTAMP(3),
    "sourceKey" TEXT,
    "createdById" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "slaw_legislation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "slaw_articles" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "legislationId" TEXT NOT NULL,
    "chapter" TEXT NOT NULL DEFAULT '',
    "number" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "appliesFrom" DATE,
    "appliesTo" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "slaw_articles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "slaw_questions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "legislationId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "answer" "SlawAnswer",
    "reason" TEXT NOT NULL DEFAULT '',
    "answeredById" TEXT,
    "answeredAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "slaw_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "slaw_requirements" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "legislationId" TEXT NOT NULL,
    "section" TEXT NOT NULL DEFAULT '',
    "text" TEXT NOT NULL,
    "articles" TEXT NOT NULL DEFAULT '',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "compliance" "SlawCompliance" NOT NULL DEFAULT 'NOT_ASSESSED',
    "reason" TEXT NOT NULL DEFAULT '',
    "assessedById" TEXT,
    "assessedAt" TIMESTAMP(3),
    "actionText" TEXT NOT NULL DEFAULT '',
    "actionOwnerId" TEXT,
    "actionDueDate" DATE,
    "actionStatus" "SlawActionStatus" NOT NULL DEFAULT 'NONE',
    "actionSetById" TEXT,
    "actionSetAt" TIMESTAMP(3),
    "actionCompletedAt" TIMESTAMP(3),
    "actionCompletedById" TEXT,
    "actionNote" TEXT NOT NULL DEFAULT '',
    "version" INTEGER NOT NULL DEFAULT 1,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "slaw_requirements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "slaw_settings_organizationId_key" ON "slaw_settings"("organizationId");

-- CreateIndex
CREATE INDEX "slaw_categories_organizationId_parentId_idx" ON "slaw_categories"("organizationId", "parentId");

-- CreateIndex
CREATE INDEX "slaw_legislation_organizationId_categoryId_idx" ON "slaw_legislation"("organizationId", "categoryId");

-- CreateIndex
CREATE INDEX "slaw_legislation_organizationId_applicability_idx" ON "slaw_legislation"("organizationId", "applicability");

-- CreateIndex
CREATE UNIQUE INDEX "slaw_legislation_organizationId_sourceKey_key" ON "slaw_legislation"("organizationId", "sourceKey");

-- CreateIndex
CREATE INDEX "slaw_articles_organizationId_legislationId_idx" ON "slaw_articles"("organizationId", "legislationId");

-- CreateIndex
CREATE INDEX "slaw_questions_organizationId_legislationId_idx" ON "slaw_questions"("organizationId", "legislationId");

-- CreateIndex
CREATE INDEX "slaw_requirements_organizationId_legislationId_idx" ON "slaw_requirements"("organizationId", "legislationId");

-- CreateIndex
CREATE INDEX "slaw_requirements_organizationId_actionStatus_actionDueDate_idx" ON "slaw_requirements"("organizationId", "actionStatus", "actionDueDate");

-- CreateIndex
CREATE INDEX "slaw_requirements_organizationId_actionOwnerId_actionStatus_idx" ON "slaw_requirements"("organizationId", "actionOwnerId", "actionStatus");

-- AddForeignKey
ALTER TABLE "slaw_categories" ADD CONSTRAINT "slaw_categories_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "slaw_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "slaw_legislation" ADD CONSTRAINT "slaw_legislation_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "slaw_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "slaw_articles" ADD CONSTRAINT "slaw_articles_legislationId_fkey" FOREIGN KEY ("legislationId") REFERENCES "slaw_legislation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "slaw_questions" ADD CONSTRAINT "slaw_questions_legislationId_fkey" FOREIGN KEY ("legislationId") REFERENCES "slaw_legislation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "slaw_requirements" ADD CONSTRAINT "slaw_requirements_legislationId_fkey" FOREIGN KEY ("legislationId") REFERENCES "slaw_legislation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Data (additive, idempotent): switch the new Simplified law module on for existing tenants and give the
-- system roles the new permission keys, matching src/lib/default-roles.ts. Roles an administrator
-- created are not touched; a key a role already holds is not added twice.
UPDATE "organizations"
SET "enabledModules" = array_append(COALESCE("enabledModules", '{}'), 'simplified-law')
WHERE NOT ('simplified-law' = ANY(COALESCE("enabledModules", '{}')));

UPDATE "roles"
SET "permissions" = array_append(COALESCE("permissions", '{}'), 'slaw.view'), "version" = "version" + 1, "updatedAt" = CURRENT_TIMESTAMP
WHERE "key" IN ('administrator', 'manager', 'ehs-manager') AND NOT ('slaw.view' = ANY(COALESCE("permissions", '{}')));

UPDATE "roles"
SET "permissions" = array_append(COALESCE("permissions", '{}'), 'slaw.assess'), "version" = "version" + 1, "updatedAt" = CURRENT_TIMESTAMP
WHERE "key" IN ('administrator', 'ehs-manager') AND NOT ('slaw.assess' = ANY(COALESCE("permissions", '{}')));

UPDATE "roles"
SET "permissions" = array_append(COALESCE("permissions", '{}'), 'slaw.manage'), "version" = "version" + 1, "updatedAt" = CURRENT_TIMESTAMP
WHERE "key" IN ('administrator', 'ehs-manager') AND NOT ('slaw.manage' = ANY(COALESCE("permissions", '{}')));
