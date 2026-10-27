"use client";

import { FileSearch } from "lucide-react";
import Link from "next/link";
import { EmptyState, ErrorState, LoadingCards } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api-client";
import { useAssessment } from "../../api";
import { AssessmentWizard } from "./assessment-wizard";

/** Edit route: the same three-step wizard, only while the assessment is a Draft or awaiting approval. */
export function AssessmentEdit({ id }: { id: string }) {
  const query = useAssessment(id);
  if (query.isPending) return <LoadingCards count={3} />;
  if (query.isError) {
    if (query.error instanceof ApiError && query.error.status === 404) return <EmptyState icon={FileSearch} title="Assessment not found" description="It does not exist or you do not have access to it." />;
    return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  }
  const a = query.data;
  if (!a.permissions.edit) {
    return (
      <EmptyState
        icon={FileSearch}
        title="This assessment cannot be edited now"
        description={a.status === "APPROVED" ? "Start a revision from the assessment first – the approved version stays in the history." : a.status === "ARCHIVED" ? "Restore it as a draft first." : "You do not have permission to change it."}
        action={
          <Button asChild variant="outline">
            <Link href={`/risk/assessments/${a.id}`}>Back to {a.reference}</Link>
          </Button>
        }
      />
    );
  }
  return <AssessmentWizard assessment={a} />;
}
