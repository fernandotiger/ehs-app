import type { Metadata } from "next";
import { IncidentsOverview } from "@/features/incidents/components/overview/incidents-overview";
import { guardModulePage } from "@/server/auth/page-guard";

export const metadata: Metadata = { title: "Incidents" };

export default async function IncidentsOverviewPage() {
  await guardModulePage("incidents");
  return <IncidentsOverview />;
}
