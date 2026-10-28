"use client";

import { ArrowRight, BookOpenCheck, FileStack } from "lucide-react";
import Link from "next/link";
import { ErrorState, LoadingRows } from "@/components/common/states";
import { StatusBadge } from "@/components/common/status-badge";
import { useCurrentUser } from "@/components/providers/current-user-provider";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PERMISSIONS } from "@/lib/permissions";
import { usePendingAcknowledgements, useComplianceSummary, useMyDocuments } from "../api";
import { relativeDue } from "../format";
import { AckStatusBadge } from "./ack-status-badge";
import { ComplianceProgress } from "./compliance-progress";
import { FileTypeIcon } from "./file-type-icon";
import { SurveyBadge } from "./survey/survey-badge";

const REPORT_PERMISSIONS = [PERMISSIONS.DOCUMENTS_ACK_REPORTS, PERMISSIONS.DOCUMENTS_MANAGE];

/** Dashboard: the signed-in user's outstanding acknowledgements. */
export function MyAcknowledgementsWidget() {
  const query = useMyDocuments({ page: 1, pageSize: 5, filter: "action" });
  const pending = usePendingAcknowledgements();
  const outstanding = query.data?.summary.outstanding ?? 0;
  const overdue = query.data?.summary.overdue ?? 0;
  const surveys = query.data?.summary.surveysToAnswer ?? 0;
  const ackTodo = outstanding ? `${outstanding} to acknowledge${overdue ? ` · ${overdue} overdue` : ""}` : null;
  // Inductions (document surveys) live in My Inductions, so the count links there.
  const surveyTodo = surveys ? (
    <Link href="/documents/surveys" className="font-medium text-brand hover:underline">
      {surveys} {surveys === 1 ? "induction" : "inductions"} to complete
    </Link>
  ) : null;

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BookOpenCheck className="size-4 text-brand" /> My acknowledgements
        </CardTitle>
        <CardDescription>
          {query.data ? (
            ackTodo || surveyTodo ? (
              <>
                {ackTodo}
                {ackTodo && surveyTodo && " · "}
                {surveyTodo}
              </>
            ) : (
              "You're all caught up"
            )
          ) : (
            "Documents waiting for you"
          )}
        </CardDescription>
        <CardAction>
          <Button asChild variant="ghost" size="sm">
            <Link href="/documents">
              View all <ArrowRight />
            </Link>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {query.isPending ? (
          <LoadingRows rows={3} />
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => query.refetch()} className="py-6" />
        ) : query.data.items.length === 0 ? (
          <p className="rounded-xl bg-success/10 px-4 py-6 text-center text-sm text-success">Nothing waiting for you.</p>
        ) : (
          <ul className="-mx-2 divide-y">
            {query.data.items.map((doc) => (
              <li key={doc.id}>
                <Link href={`/documents/${doc.id}`} className="flex items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-muted/50">
                  <FileTypeIcon mimeType={doc.currentVersion?.mimeType} className="size-9" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{doc.title}</p>
                    <p className="truncate text-xs text-muted-foreground">{relativeDue(doc.dueAt) ?? doc.category?.name}</p>
                  </div>
                  {doc.ackStatus === "outstanding" || doc.ackStatus === "overdue" ? (
                    <AckStatusBadge status={doc.ackStatus} pendingSync={pending.has(doc.id)} className="hidden sm:inline-flex" />
                  ) : (
                    <SurveyBadge survey={doc.survey} className="hidden sm:inline-flex" />
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/** Dashboard: documents with the most outstanding acknowledgements (report permission only). */
export function DocumentComplianceWidget() {
  const { canAny } = useCurrentUser();
  const allowed = canAny(REPORT_PERMISSIONS);
  const query = useComplianceSummary(5, allowed);
  if (!allowed) return null;

  const totals = query.data?.totals;
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileStack className="size-4 text-brand" /> Document compliance
        </CardTitle>
        <CardDescription>
          {totals ? `${totals.acknowledged} of ${totals.required} acknowledgements complete across ${totals.documents} documents` : "Acknowledgement progress"}
        </CardDescription>
        <CardAction>
          <Button asChild variant="ghost" size="sm">
            <Link href="/documents/manage">
              Library <ArrowRight />
            </Link>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {query.isPending ? (
          <LoadingRows rows={4} />
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => query.refetch()} className="py-6" />
        ) : query.data.items.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No published documents require acknowledgement.</p>
        ) : (
          <ul className="space-y-4">
            {query.data.items.map((item) => (
              <li key={item.id}>
                <Link href={`/documents/manage/${item.id}`} className="block rounded-lg hover:bg-muted/40">
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-medium">{item.title}</p>
                    {item.stats.overdue > 0 && (
                      <StatusBadge tone="danger" className="h-5 shrink-0">
                        {item.stats.overdue} overdue
                      </StatusBadge>
                    )}
                  </div>
                  <ComplianceProgress stats={item.stats} compact />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
