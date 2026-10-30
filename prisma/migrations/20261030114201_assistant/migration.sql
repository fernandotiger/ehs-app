-- CreateTable
CREATE TABLE "assistant_configs" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "name" VARCHAR(60) NOT NULL,
    "welcomeMessage" VARCHAR(600) NOT NULL,
    "suggestedQuestions" TEXT[],
    "model" VARCHAR(120) NOT NULL,
    "fallbackModel" VARCHAR(120),
    "temperature" DOUBLE PRECISION NOT NULL DEFAULT 0.3,
    "maxTokens" INTEGER NOT NULL DEFAULT 800,
    "knowledgeText" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assistant_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "assistant_configs_organizationId_key" ON "assistant_configs"("organizationId");
