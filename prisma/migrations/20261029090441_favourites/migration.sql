-- CreateEnum
CREATE TYPE "FavouriteKind" AS ENUM ('PAGE', 'EXTERNAL');

-- CreateTable
CREATE TABLE "favourites" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "FavouriteKind" NOT NULL,
    "title" VARCHAR(60) NOT NULL,
    "icon" VARCHAR(40),
    "color" VARCHAR(20),
    "url" VARCHAR(2000) NOT NULL,
    "snapshot" JSONB,
    "sortOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "favourites_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "favourites_organizationId_userId_sortOrder_idx" ON "favourites"("organizationId", "userId", "sortOrder");

-- AddForeignKey
ALTER TABLE "favourites" ADD CONSTRAINT "favourites_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
