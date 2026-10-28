-- AlterTable
ALTER TABLE "attachments" ALTER COLUMN "uploadedById" DROP NOT NULL;

-- AlterTable
ALTER TABLE "incidents" ADD COLUMN     "anonymousReporterKey" TEXT,
ADD COLUMN     "isAnonymous" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "reporterId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "incidents_organizationId_anonymousReporterKey_idx" ON "incidents"("organizationId", "anonymousReporterKey");
