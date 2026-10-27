import type { Metadata } from "next";
import { Suspense } from "react";
import { AccessDenied } from "@/components/common/access-denied";
import { LoadingRows } from "@/components/common/states";
import { RiskReportsPage } from "@/features/risk/components/reports/risk-reports";
import { PERMISSIONS } from "@/lib/permissions";
import { guardModulePage } from "@/server/auth/page-guard";

export const metadata: Metadata = { title: "Risk reports" };

export default async function RiskReportsRoute() {
  if (!(await guardModulePage("risk", PERMISSIONS.RISK_VIEW, PERMISSIONS.RISK_TASK_VIEW))) return <AccessDenied />;
  return (
    <Suspense fallback={<LoadingRows rows={8} />}>
      <RiskReportsPage />
    </Suspense>
  );
}
