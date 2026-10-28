-- CreateTable
CREATE TABLE "document_tags" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_tag_links" (
    "organizationId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_tag_links_pkey" PRIMARY KEY ("documentId","tagId")
);

-- CreateIndex
CREATE UNIQUE INDEX "document_tags_organizationId_normalizedName_key" ON "document_tags"("organizationId", "normalizedName");

-- CreateIndex
CREATE INDEX "document_tag_links_organizationId_tagId_idx" ON "document_tag_links"("organizationId", "tagId");

-- AddForeignKey
ALTER TABLE "document_tag_links" ADD CONSTRAINT "document_tag_links_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_tag_links" ADD CONSTRAINT "document_tag_links_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "document_tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;
