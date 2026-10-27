import type { Metadata } from "next";
import { AccessDenied } from "@/components/common/access-denied";
import { ReportWizard } from "@/features/incidents/components/report/report-wizard";
import { PERMISSIONS } from "@/lib/permissions";
import { guardModulePage } from "@/server/auth/page-guard";

export const metadata: Metadata = { title: "Report incident" };

export default async function ReportIncidentPage() {
  if (!(await guardModulePage("incidents", PERMISSIONS.INCIDENT_CREATE))) return <AccessDenied message="You don't have permission to report incidents." />;
  return <ReportWizard />;
}
