import type { Metadata } from "next";
import { AccessDenied } from "@/components/common/access-denied";
import { AssessmentWizard } from "@/features/risk/components/assessments/assessment-wizard";
import { PERMISSIONS } from "@/lib/permissions";
import { guardModulePage } from "@/server/auth/page-guard";

export const metadata: Metadata = { title: "New risk assessment" };

export default async function NewAssessmentPage() {
  if (!(await guardModulePage("risk", PERMISSIONS.RISK_CREATE))) return <AccessDenied message="Creating risk assessments needs the Create risks permission." />;
  return <AssessmentWizard />;
}
