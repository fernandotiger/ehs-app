-- CreateEnum
CREATE TYPE "DocumentSurveyStatus" AS ENUM ('ACTIVE', 'CLOSED', 'REPLACED');

-- CreateEnum
CREATE TYPE "DocumentSurveyQuestionType" AS ENUM ('TEXT', 'SINGLE', 'MULTIPLE');

-- CreateTable
CREATE TABLE "document_surveys" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "intro" TEXT,
    "isMandatory" BOOLEAN NOT NULL DEFAULT false,
    "dueDays" INTEGER,
    "mandatorySince" TIMESTAMP(3),
    "allowAnonymous" BOOLEAN NOT NULL DEFAULT true,
    "status" "DocumentSurveyStatus" NOT NULL DEFAULT 'ACTIVE',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),
    "replacedAt" TIMESTAMP(3),

    CONSTRAINT "document_surveys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_survey_questions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "surveyId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "type" "DocumentSurveyQuestionType" NOT NULL,
    "label" TEXT NOT NULL,
    "help" TEXT,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "options" TEXT[],

    CONSTRAINT "document_survey_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_survey_responses" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "surveyId" TEXT NOT NULL,
    "documentVersionNumber" INTEGER NOT NULL,
    "respondentId" TEXT,
    "isAnonymous" BOOLEAN NOT NULL DEFAULT false,
    "submittedOn" DATE NOT NULL,

    CONSTRAINT "document_survey_responses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_survey_answers" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "responseId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "text" TEXT,
    "choices" TEXT[],

    CONSTRAINT "document_survey_answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_survey_participations" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "surveyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "answeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_survey_participations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "document_surveys_organizationId_status_idx" ON "document_surveys"("organizationId", "status");

-- CreateIndex
CREATE INDEX "document_surveys_documentId_status_idx" ON "document_surveys"("documentId", "status");

-- CreateIndex
CREATE INDEX "document_survey_questions_organizationId_idx" ON "document_survey_questions"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "document_survey_questions_surveyId_position_key" ON "document_survey_questions"("surveyId", "position");

-- CreateIndex
CREATE INDEX "document_survey_responses_surveyId_isAnonymous_idx" ON "document_survey_responses"("surveyId", "isAnonymous");

-- CreateIndex
CREATE INDEX "document_survey_responses_organizationId_idx" ON "document_survey_responses"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "document_survey_responses_surveyId_respondentId_key" ON "document_survey_responses"("surveyId", "respondentId");

-- CreateIndex
CREATE INDEX "document_survey_answers_questionId_idx" ON "document_survey_answers"("questionId");

-- CreateIndex
CREATE INDEX "document_survey_answers_organizationId_idx" ON "document_survey_answers"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "document_survey_answers_responseId_questionId_key" ON "document_survey_answers"("responseId", "questionId");

-- CreateIndex
CREATE INDEX "document_survey_participations_userId_idx" ON "document_survey_participations"("userId");

-- CreateIndex
CREATE INDEX "document_survey_participations_organizationId_idx" ON "document_survey_participations"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "document_survey_participations_surveyId_userId_key" ON "document_survey_participations"("surveyId", "userId");

-- AddForeignKey
ALTER TABLE "document_surveys" ADD CONSTRAINT "document_surveys_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_surveys" ADD CONSTRAINT "document_surveys_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_survey_questions" ADD CONSTRAINT "document_survey_questions_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES "document_surveys"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_survey_responses" ADD CONSTRAINT "document_survey_responses_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES "document_surveys"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_survey_responses" ADD CONSTRAINT "document_survey_responses_respondentId_fkey" FOREIGN KEY ("respondentId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_survey_answers" ADD CONSTRAINT "document_survey_answers_responseId_fkey" FOREIGN KEY ("responseId") REFERENCES "document_survey_responses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_survey_answers" ADD CONSTRAINT "document_survey_answers_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "document_survey_questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_survey_participations" ADD CONSTRAINT "document_survey_participations_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES "document_surveys"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_survey_participations" ADD CONSTRAINT "document_survey_participations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Append-only survey answers (same approach as document_acknowledgements).
-- Responses, answers and participation can only be inserted; UPDATE, DELETE and TRUNCATE are
-- rejected by the database itself. The function comes from the init migration (re-declared
-- here so this migration also stands on its own).
CREATE OR REPLACE FUNCTION prevent_mutation_of_immutable_rows()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Table "%" is append-only: % is not permitted', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER document_survey_responses_immutable
  BEFORE UPDATE OR DELETE ON "document_survey_responses"
  FOR EACH ROW EXECUTE FUNCTION prevent_mutation_of_immutable_rows();
CREATE TRIGGER document_survey_responses_no_truncate
  BEFORE TRUNCATE ON "document_survey_responses"
  FOR EACH STATEMENT EXECUTE FUNCTION prevent_mutation_of_immutable_rows();

CREATE TRIGGER document_survey_answers_immutable
  BEFORE UPDATE OR DELETE ON "document_survey_answers"
  FOR EACH ROW EXECUTE FUNCTION prevent_mutation_of_immutable_rows();
CREATE TRIGGER document_survey_answers_no_truncate
  BEFORE TRUNCATE ON "document_survey_answers"
  FOR EACH STATEMENT EXECUTE FUNCTION prevent_mutation_of_immutable_rows();

CREATE TRIGGER document_survey_participations_immutable
  BEFORE UPDATE OR DELETE ON "document_survey_participations"
  FOR EACH ROW EXECUTE FUNCTION prevent_mutation_of_immutable_rows();
CREATE TRIGGER document_survey_participations_no_truncate
  BEFORE TRUNCATE ON "document_survey_participations"
  FOR EACH STATEMENT EXECUTE FUNCTION prevent_mutation_of_immutable_rows();
