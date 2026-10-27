"use client";

import { FileSearch, Lock } from "lucide-react";
import { EmptyState, ErrorState, LoadingCards } from "@/components/common/states";
import { ApiError } from "@/lib/api-client";
import { useIncident } from "../../api";
import { ReportWizard } from "./report-wizard";

/** Edit an existing report with the same wizard (closed reports must be reopened first). */
export function IncidentEdit({ id }: { id: string }) {
  const query = useIncident(id);
  if (query.isPending) return <LoadingCards count={4} />;
  if (query.isError) {
    if (query.error instanceof ApiError && query.error.status === 404) return <EmptyState icon={FileSearch} title="Incident not found" className="mt-6" />;
    return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  }
  const incident = query.data;
  if (!incident.permissions.edit) {
    return (
      <EmptyState
        icon={Lock}
        title={incident.closedAt ? "Reopen the incident to edit it" : "You cannot edit this report"}
        description={incident.closedAt ? "Closed reports are reopened before ordinary editing." : "Only the reporter (while it is a draft) and people who triage incidents can edit it."}
        className="mt-6"
      />
    );
  }
  return <ReportWizard incident={incident} />;
}
