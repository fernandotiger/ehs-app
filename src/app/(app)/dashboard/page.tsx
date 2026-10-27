import { format } from "date-fns";
import { FilePlus2, FileText, Inbox } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/common/states";
import { PageBanner } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { InsightsSection } from "@/features/configuration/components/insights-section";
import { DocumentComplianceWidget, MyAcknowledgementsWidget } from "@/features/documents/components/dashboard-widgets";
import { IncidentDashboardWidget } from "@/features/incidents/components/overview/incidents-overview";
import { RiskDashboardWidget } from "@/features/risk/components/overview/risk-overview";
import { PERMISSIONS } from "@/lib/permissions";
import { MyWorkWidget } from "@/features/my-work/components/my-work";
import { guardPage } from "@/server/auth/page-guard";

export const metadata: Metadata = { title: "Home" };

/** Home: greeting, quick actions, the top of My work and one widget row per enabled module. */
export default async function DashboardPage() {
  const user = (await guardPage())!;
  const firstName = user.name.split(" ")[0];
  const documents = user.enabledModules.includes("documents");
  const incidents = user.enabledModules.includes("incidents");
  const risk = user.enabledModules.includes("risk");

  return (
    <>
      <PageBanner
        title={`Welcome back ${firstName}`}
        description={`${format(new Date(), "EEEE, d MMMM")} · ${[user.organizationName, user.jobTitle, user.siteName].filter(Boolean).join(" · ")}`}
        actions={
          <>
            <Button asChild variant="secondary" className="bg-white text-brand-dark hover:bg-white/90">
              <Link href="/my-work">
                <Inbox /> My work
              </Link>
            </Button>
            {incidents && user.permissions.includes(PERMISSIONS.INCIDENT_CREATE) ? (
              <Button asChild className="bg-brand-dark text-brand-dark-foreground hover:bg-brand-dark/90">
                <Link href="/incidents/new">
                  <FilePlus2 /> Report incident
                </Link>
              </Button>
            ) : (
              documents && (
                <Button asChild className="bg-brand-dark text-brand-dark-foreground hover:bg-brand-dark/90">
                  <Link href="/documents">
                    <FileText /> My documents
                  </Link>
                </Button>
              )
            )}
          </>
        }
      />

      <div className="mb-6">
        <MyWorkWidget />
      </div>

      {incidents && (
        <div className="mb-6">
          <IncidentDashboardWidget />
        </div>
      )}

      {risk && (
        <div className="mb-6">
          <RiskDashboardWidget />
        </div>
      )}

      {documents ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <MyAcknowledgementsWidget />
          <DocumentComplianceWidget />
        </div>
      ) : (
        !incidents && !risk && <EmptyState icon={Inbox} title="You're all set" description="Modules enabled for your company will show their summaries here." />
      )}

      <InsightsSection />
    </>
  );
}
