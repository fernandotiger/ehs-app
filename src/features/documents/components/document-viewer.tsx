"use client";

import { ClipboardList, FileSearch, Settings2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import { EmptyState, ErrorState, LoadingRows } from "@/components/common/states";
import { StatusBadge } from "@/components/common/status-badge";
import { PageHeader } from "@/components/layout/page-header";
import { useCurrentUser } from "@/components/providers/current-user-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ApiError } from "@/lib/api-client";
import { PERMISSIONS } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { formatBytes } from "@/lib/upload-client";
import { usePendingAcknowledgements, useDocument } from "../api";
import { DOCUMENT_STATUS_META, formatDate } from "../format";
import { AckStatusBadge } from "./ack-status-badge";
import { AcknowledgementPanel } from "./acknowledgement-panel";
import { FilePreview } from "./file-preview";
import { surveyPageHref } from "../survey-format";
import { SurveyCard } from "./survey/survey-card";
import { TagChips } from "./tag-chips";

/** Employee document viewer: preview, open/download, and the acknowledgement panel. */
export function DocumentViewer({ id }: { id: string }) {
  const query = useDocument(id);
  const pending = usePendingAcknowledgements();
  const { canAny } = useCurrentUser();
  const [openedLocally, setOpenedLocally] = useState(false);
  const refetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { refetch } = query;

  // Opening/downloading hits the audited file route; refresh "opened" shortly after.
  const onOpened = useCallback(() => {
    setOpenedLocally(true);
    if (refetchTimer.current) clearTimeout(refetchTimer.current);
    refetchTimer.current = setTimeout(() => void refetch(), 1200);
  }, [refetch]);

  if (query.isPending) return <LoadingRows rows={6} className="[&>*:first-child]:h-20 [&>*]:h-24" />;
  if (query.isError) {
    if (query.error instanceof ApiError && query.error.status === 404) {
      return (
        <EmptyState
          icon={FileSearch}
          title="Document not found"
          description="This document doesn't exist, has been withdrawn, or isn't available to you."
          action={
            <Button asChild variant="outline">
              <Link href="/documents">Back to My Documents</Link>
            </Button>
          }
          className="mt-6"
        />
      );
    }
    return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  }

  const doc = query.data;
  const isPending = pending.has(doc.id);
  const status = DOCUMENT_STATUS_META[doc.status];
  const ackToDo = doc.assigned && (doc.ackStatus === "outstanding" || doc.ackStatus === "overdue") && !isPending;

  return (
    <>
      <PageHeader
        title={doc.title}
        backHref={doc.isSurvey ? "/documents/surveys" : "/documents"}
        backLabel={doc.isSurvey ? "My Inductions" : "My Documents"}
        meta={
          <>
            {doc.status !== "PUBLISHED" && <StatusBadge tone={status.tone}>{status.label}</StatusBadge>}
            {doc.category && <StatusBadge tone="brand">{doc.category.name}</StatusBadge>}
            {doc.currentVersion && <StatusBadge>Version {doc.currentVersion.versionNumber}</StatusBadge>}
            <AckStatusBadge status={doc.ackStatus} acknowledgedAt={doc.acknowledgement?.acknowledgedAt} pendingSync={isPending} />
            <TagChips tags={doc.tags} max={6} />
          </>
        }
        actions={
          canAny([PERMISSIONS.DOCUMENTS_MANAGE, PERMISSIONS.DOCUMENTS_ACK_REPORTS]) ? (
            <Button asChild variant="outline">
              <Link href={doc.isSurvey ? surveyPageHref(doc.id) : `/documents/manage/${doc.id}`}>
                <Settings2 /> Manage
              </Link>
            </Button>
          ) : undefined
        }
      />

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-6">
        <div className="min-w-0">
          {doc.currentVersion ? (
            <FilePreview documentId={doc.id} version={doc.currentVersion} onOpened={onOpened} />
          ) : (
            // Only surveys can be published without a file.
            <EmptyState icon={ClipboardList} title="No file to read" description="There is nothing to open first – you can complete the induction straight away." />
          )}
        </div>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-20">
          {(doc.currentVersion || doc.requiresAcknowledgement) && <AcknowledgementPanel key={doc.currentVersion?.id} doc={doc} pendingSync={isPending} openedLocally={openedLocally} />}
          {/* On phones the survey is the first card after the preview unless an acknowledgement is still to do. */}
          <div className={cn(!ackToDo && "max-lg:order-first")}>
            <SurveyCard doc={doc} openedLocally={openedLocally} />
          </div>
          <Card size="sm">
            <CardHeader>
              <CardTitle>About this document</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {doc.description && <p className="text-muted-foreground">{doc.description}</p>}
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
                {doc.referenceCode && (
                  <>
                    <dt className="text-muted-foreground">Reference</dt>
                    <dd className="font-medium">{doc.referenceCode}</dd>
                  </>
                )}
                <dt className="text-muted-foreground">Published</dt>
                <dd className="font-medium">{formatDate(doc.publishedAt)}</dd>
                <dt className="text-muted-foreground">Last updated</dt>
                <dd className="font-medium">{formatDate(doc.currentVersion?.createdAt ?? doc.updatedAt)}</dd>
                {doc.currentVersion && (
                  <>
                    <dt className="text-muted-foreground">File size</dt>
                    <dd className="font-medium">{formatBytes(doc.currentVersion.sizeBytes)}</dd>
                  </>
                )}
              </dl>
              {doc.currentVersion?.changeNote && doc.currentVersion.versionNumber > 1 && (
                <p className="rounded-lg bg-muted p-2.5 text-xs">
                  <span className="font-medium">What changed: </span>
                  {doc.currentVersion.changeNote}
                </p>
              )}
            </CardContent>
          </Card>
        </aside>
      </div>
    </>
  );
}
