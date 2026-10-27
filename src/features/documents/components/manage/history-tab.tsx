"use client";

import { History } from "lucide-react";
import { useState } from "react";
import { PaginationBar } from "@/components/common/pagination-bar";
import { EmptyState, ErrorState, LoadingRows } from "@/components/common/states";
import { Card, CardAction, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useDocumentAudit, type DocumentAuditEntry } from "../../api";
import { AUDIT_ACTION_LABELS, formatDateTime } from "../../format";

const PAGE_SIZE = 25;

const FIELD_LABELS: Record<string, string> = {
  title: "Title",
  description: "Description",
  referenceCode: "Reference",
  category: "Category",
  audience: "Audience",
  requiresAcknowledgement: "Acknowledgement required",
  ackDueDays: "Due days",
  reminderIntervalDays: "Reminder interval",
  escalationDays: "Escalation days",
  escalationTarget: "Escalate to",
  status: "Status",
  versionNumber: "Version",
  ackRequiredFromVersion: "Acknowledgement required from version",
  changeNote: "Change note",
  fileName: "File",
  requiresReacknowledgement: "Re-acknowledgement required",
  surveyTitle: "Survey title",
  surveyIntro: "Survey introduction",
  surveyMandatory: "Everyone must answer",
  surveyDueDays: "Answer within (days)",
  surveyAnonymous: "Anonymous answers allowed",
  surveyQuestions: "Survey questions",
  surveyStatus: "Survey status",
};

function isFromTo(value: unknown): value is { from: unknown; to: unknown } {
  return typeof value === "object" && value !== null && "to" in value && "from" in value;
}

function show(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object") return "updated";
  return String(value);
}

/** Human-readable summary of an audit entry's changes/metadata. */
function describe(entry: DocumentAuditEntry): string[] {
  const lines: string[] = [];
  const changes = entry.changes && typeof entry.changes === "object" ? (entry.changes as Record<string, unknown>) : null;
  if (changes && entry.action !== "DOCUMENT_CREATED") {
    for (const [key, value] of Object.entries(changes)) {
      const label = FIELD_LABELS[key] ?? key;
      if (isFromTo(value)) {
        lines.push(key === "audience" ? "Audience changed" : `${label}: ${show(value.from)} → ${show(value.to)}`);
      } else if (typeof value !== "object" || value === null) {
        lines.push(`${label}: ${show(value)}`);
      }
    }
  }
  const meta = entry.metadata && typeof entry.metadata === "object" ? (entry.metadata as Record<string, unknown>) : null;
  if (meta) {
    if (typeof meta.versionNumber === "number") lines.push(`Version ${meta.versionNumber}`);
    if (typeof meta.status === "string") lines.push(`Export: ${meta.status}`);
    if (meta.source === "OFFLINE_SYNC") lines.push("Synced from offline");
    if (entry.action === "DOCUMENT_SURVEY_REMINDED" && typeof meta.notified === "number") lines.push(`${meta.notified} reminded`);
    if (entry.action === "DOCUMENT_SURVEY_EXPORTED" && typeof meta.rows === "number") lines.push(`${meta.rows} answers exported`);
  }
  return lines;
}

export function HistoryTab({ documentId }: { documentId: string }) {
  const [page, setPage] = useState(1);
  const [includeActivity, setIncludeActivity] = useState(false);
  const audit = useDocumentAudit(documentId, { page, pageSize: PAGE_SIZE, kind: includeActivity ? "all" : "changes" });

  return (
    <Card className="gap-0 py-0">
      <CardHeader className="border-b py-4">
        <CardTitle>History</CardTitle>
        <CardDescription>Tamper-evident audit trail for this document.</CardDescription>
        <CardAction className="flex items-center gap-2">
          <Switch
            id="history-activity"
            checked={includeActivity}
            onCheckedChange={(v) => {
              setIncludeActivity(v);
              setPage(1);
            }}
          />
          <Label htmlFor="history-activity" className="text-xs font-normal sm:text-sm">
            Employee activity
          </Label>
        </CardAction>
      </CardHeader>
      {audit.isPending ? (
        <LoadingRows rows={5} className="p-4" />
      ) : audit.isError ? (
        <ErrorState error={audit.error} onRetry={() => audit.refetch()} className="m-4" />
      ) : audit.data.items.length === 0 ? (
        <EmptyState icon={History} title="No history yet" className="m-4 border-0" />
      ) : (
        <>
          <ol className="divide-y">
            {audit.data.items.map((entry) => {
              const lines = describe(entry);
              return (
                <li key={entry.id} className="flex gap-3 px-4 py-3">
                  <span className="mt-1.5 size-2 shrink-0 rounded-full bg-brand" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
                      <p className="text-sm">
                        <span className="font-medium">{AUDIT_ACTION_LABELS[entry.action] ?? entry.action}</span>
                        {entry.actorName && <span className="text-muted-foreground"> · {entry.actorName}</span>}
                      </p>
                      <time className="shrink-0 text-xs text-muted-foreground" dateTime={entry.createdAt}>
                        {formatDateTime(entry.createdAt)}
                      </time>
                    </div>
                    {lines.length > 0 && (
                      <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                        {lines.map((line, i) => (
                          <li key={i} className="break-words">
                            {line}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
          <div className="border-t px-3">
            <PaginationBar page={page} pageSize={PAGE_SIZE} total={audit.data.total} onPageChange={setPage} />
          </div>
        </>
      )}
    </Card>
  );
}
