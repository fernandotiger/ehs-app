import type { Metadata } from "next";
import { Suspense } from "react";
import { AccessDenied } from "@/components/common/access-denied";
import { LoadingCards } from "@/components/common/states";
import { ReportWizard } from "@/features/incidents/components/report/report-wizard";
import { PERMISSIONS } from "@/lib/permissions";
import { guardModulePage } from "@/server/auth/page-guard";

export const metadata: Metadata = { title: "Report incident" };

export default async function ReportIncidentPage() {
  if (!(await guardModulePage("incidents", PERMISSIONS.INCIDENT_CREATE))) return <AccessDenied message="You don't have permission to report incidents." />;
  // The wizard reads `?fav=` (a favourite's kept values), so it sits in its own Suspense boundary.
  return (
    <Suspense fallback={<LoadingCards count={4} />}>
      <ReportWizard />
    </Suspense>
  );
}
