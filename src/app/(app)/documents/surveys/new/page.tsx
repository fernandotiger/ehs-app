import type { Metadata } from "next";
import { Suspense } from "react";
import { AccessDenied } from "@/components/common/access-denied";
import { LoadingCards } from "@/components/common/states";
import { NewSurveyForm } from "@/features/documents/components/survey/new-survey-form";
import { guardModulePage } from "@/server/auth/page-guard";
import { DOCUMENT_PERMISSIONS } from "@/server/modules/documents/document-permissions";

export const metadata: Metadata = { title: "Create Employee Induction" };

export default async function NewSurveyPage() {
  if (!(await guardModulePage("documents", ...DOCUMENT_PERMISSIONS.MANAGE))) return <AccessDenied />;
  // The form reads `?fav=` (a favourite's kept values), so it sits in its own Suspense boundary.
  return (
    <Suspense fallback={<LoadingCards count={3} />}>
      <NewSurveyForm />
    </Suspense>
  );
}
