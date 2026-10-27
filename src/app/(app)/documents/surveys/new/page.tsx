import type { Metadata } from "next";
import { AccessDenied } from "@/components/common/access-denied";
import { NewSurveyForm } from "@/features/documents/components/survey/new-survey-form";
import { guardModulePage } from "@/server/auth/page-guard";
import { DOCUMENT_PERMISSIONS } from "@/server/modules/documents/document-permissions";

export const metadata: Metadata = { title: "Create survey" };

export default async function NewSurveyPage() {
  if (!(await guardModulePage("documents", ...DOCUMENT_PERMISSIONS.MANAGE))) return <AccessDenied />;
  return <NewSurveyForm />;
}
