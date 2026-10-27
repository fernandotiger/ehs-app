-- AlterTable
ALTER TABLE "document_categories" ADD COLUMN     "color" TEXT,
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "org_settings" ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "roles" ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "directoryRoleId" TEXT;

-- CreateIndex
CREATE INDEX "users_directoryRoleId_idx" ON "users"("directoryRoleId");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_directoryRoleId_fkey" FOREIGN KEY ("directoryRoleId") REFERENCES "roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
