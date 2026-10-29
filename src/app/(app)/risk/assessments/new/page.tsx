import type { Metadata } from "next";
import { Suspense } from "react";
import { AccessDenied } from "@/components/common/access-denied";
import { LoadingCards } from "@/components/common/states";
import { AssessmentWizard } from "@/features/risk/components/assessments/assessment-wizard";
import { PERMISSIONS } from "@/lib/permissions";
import { guardModulePage } from "@/server/auth/page-guard";

export const metadata: Metadata = { title: "New risk assessment" };

export default async function NewAssessmentPage() {
  if (!(await guardModulePage("risk", PERMISSIONS.RISK_CREATE))) return <AccessDenied message="Creating risk assessments needs the Create risks permission." />;
  // The wizard reads `?fav=` (a favourite's kept values), so it sits in its own Suspense boundary.
  return (
    <Suspense fallback={<LoadingCards count={3} />}>
      <AssessmentWizard />
    </Suspense>
  );
}
