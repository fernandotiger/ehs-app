import type { Metadata } from "next";
import { Suspense } from "react";
import { AccessDenied } from "@/components/common/access-denied";
import { LoadingRows } from "@/components/common/states";
import { IncidentReportsPage } from "@/features/incidents/components/reports/reports-page";
import { PERMISSIONS } from "@/lib/permissions";
import { guardModulePage } from "@/server/auth/page-guard";

export const metadata: Metadata = { title: "Incident reports" };

export default async function IncidentReportsRoute() {
  if (!(await guardModulePage("incidents", PERMISSIONS.INCIDENT_VIEW, PERMISSIONS.INCIDENT_ACTION_VIEW))) return <AccessDenied />;
  return (
    <Suspense fallback={<LoadingRows rows={8} />}>
      <IncidentReportsPage />
    </Suspense>
  );
}
