import type { Metadata } from "next";
import { AccessDenied } from "@/components/common/access-denied";
import { IncidentSettings } from "@/features/incidents/components/config/incident-settings";
import { PERMISSIONS } from "@/lib/permissions";
import { hasCompanyScope } from "@/server/auth/authorization";
import { guardModulePage } from "@/server/auth/page-guard";

export const metadata: Metadata = { title: "Incident settings" };

export default async function IncidentSettingsPage() {
  const user = await guardModulePage("incidents", PERMISSIONS.INCIDENT_CONFIGURE);
  if (!user || !hasCompanyScope(user, PERMISSIONS.INCIDENT_CONFIGURE)) {
    return <AccessDenied message="Incident settings need the Configure incidents permission for the whole company." />;
  }
  return <IncidentSettings />;
}
