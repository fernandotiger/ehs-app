import type { Metadata } from "next";
import { AccessDenied } from "@/components/common/access-denied";
import { SurveyLibrary } from "@/features/documents/components/survey/survey-library";
import { guardModulePage } from "@/server/auth/page-guard";
import { DOCUMENT_PERMISSIONS } from "@/server/modules/documents/document-permissions";

export const metadata: Metadata = { title: "Employee Induction Library" };

export default async function SurveyLibraryPage() {
  if (!(await guardModulePage("documents", ...DOCUMENT_PERMISSIONS.LIBRARY))) return <AccessDenied />;
  return <SurveyLibrary />;
}
