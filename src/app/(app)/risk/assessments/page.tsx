import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingRows } from "@/components/common/states";
import { AssessmentRegister } from "@/features/risk/components/assessments/assessment-register";
import { guardModulePage } from "@/server/auth/page-guard";

export const metadata: Metadata = { title: "Risk assessments" };

export default async function RiskAssessmentsPage() {
  await guardModulePage("risk");
  return (
    <Suspense fallback={<LoadingRows rows={6} />}>
      <AssessmentRegister />
    </Suspense>
  );
}
