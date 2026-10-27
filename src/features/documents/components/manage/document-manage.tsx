"use client";

import { Archive, ArchiveRestore, Eye, FileSearch, Send } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { EmptyState, ErrorState, LoadingRows } from "@/components/common/states";
import { StatusBadge } from "@/components/common/status-badge";
import { PageHeader } from "@/components/layout/page-header";
import { useCurrentUser } from "@/components/providers/current-user-provider";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ApiError, errorMessage } from "@/lib/api-client";
import { PERMISSIONS } from "@/lib/permissions";
import { useDocumentAction, useManageDocument, type DocumentAction, type ManageDocumentDto } from "../../api";
import { DOCUMENT_STATUS_META } from "../../format";
import { AcknowledgementsTab } from "./acknowledgements-tab";
import { HistoryTab } from "./history-tab";
import { OverviewTab } from "./overview-tab";
import { VersionsTab } from "./versions-tab";

/** Header actions shared by the document and survey management pages. */
export function DocumentActions({ doc }: { doc: ManageDocumentDto }) {
  const { can, canAny } = useCurrentUser();
  const action = useDocumentAction(doc.id);
  const canManage = can(PERMISSIONS.DOCUMENTS_MANAGE);
  const canOpen = canAny([PERMISSIONS.DOCUMENTS_MANAGE, PERMISSIONS.DOCUMENTS_VIEW_ALL]);

  const run = async (kind: DocumentAction, success: string) => {
    try {
      const res = await action.mutateAsync(kind);
      toast.success(res.notified ? `${success} – ${res.notified.toLocaleString()} ${res.notified === 1 ? "person" : "people"} notified.` : success);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };

  return (
    <>
      {canOpen && (doc.currentVersion || doc.survey) && (
        <Button asChild variant="outline">
          <Link href={`/documents/${doc.id}`}>
            <Eye /> View as employee
          </Link>
        </Button>
      )}
      {canManage && doc.status === "DRAFT" && (
        <ConfirmDialog
          trigger={
            <Button disabled={action.isPending}>
              <Send /> Publish
            </Button>
          }
          title={`Publish “${doc.title}”?`}
          description="Everyone in the audience will be notified and can open the document straight away."
          confirmLabel="Publish"
          onConfirm={() => run("publish", "Published")}
        />
      )}
      {canManage && doc.status !== "ARCHIVED" && (
        <ConfirmDialog
          trigger={
            <Button variant="outline" disabled={action.isPending}>
              <Archive /> Archive
            </Button>
          }
          title={`Archive “${doc.title}”?`}
          description="Employees will no longer see it. Versions, acknowledgements and history are kept, and you can restore it later."
          confirmLabel="Archive"
          destructive
          onConfirm={() => run("archive", "Archived")}
        />
      )}
      {canManage && doc.status === "ARCHIVED" && (
        <Button variant="outline" disabled={action.isPending} onClick={() => void run("restore", "Restored")}>
          <ArchiveRestore /> Restore
        </Button>
      )}
    </>
  );
}

/** Document management detail: Overview · Versions · Acknowledgements · History. Surveys have their own page (`SurveyManage`). */
export function DocumentManage({ id }: { id: string }) {
  const query = useManageDocument(id);
  const { canAny } = useCurrentUser();
  const canReport = canAny([PERMISSIONS.DOCUMENTS_ACK_REPORTS, PERMISSIONS.DOCUMENTS_MANAGE]);
  const [tab, setTab] = useState("overview");

  if (query.isPending) return <LoadingRows rows={6} className="[&>*:first-child]:h-20 [&>*]:h-24" />;
  if (query.isError) {
    if (query.error instanceof ApiError && query.error.status === 404) {
      return <EmptyState icon={FileSearch} title="Document not found" className="mt-6" />;
    }
    return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  }

  const doc = query.data;
  const status = DOCUMENT_STATUS_META[doc.status];

  return (
    <>
      <PageHeader
        title={doc.title}
        backHref="/documents/manage"
        backLabel="Document Library"
        meta={
          <>
            <StatusBadge tone={status.tone} dot>
              {status.label}
            </StatusBadge>
            {doc.category && <StatusBadge tone="brand">{doc.category.name}</StatusBadge>}
            {doc.currentVersion && <StatusBadge>Version {doc.currentVersion.versionNumber}</StatusBadge>}
            {doc.referenceCode && <StatusBadge>{doc.referenceCode}</StatusBadge>}
            {doc.requiresAcknowledgement && <StatusBadge tone="warning">Acknowledgement required</StatusBadge>}
          </>
        }
        actions={<DocumentActions doc={doc} />}
      />

      <Tabs value={tab} onValueChange={setTab} className="gap-4">
        <div className="-mx-3 overflow-x-auto overflow-y-hidden px-3 md:mx-0 md:px-0">
          <TabsList className="h-9">
            <TabsTrigger value="overview" className="px-3">
              Overview
            </TabsTrigger>
            <TabsTrigger value="versions" className="px-3">
              Versions
            </TabsTrigger>
            {canReport && (
              <TabsTrigger value="acknowledgements" className="px-3">
                Acknowledgements
              </TabsTrigger>
            )}
            {canReport && (
              <TabsTrigger value="history" className="px-3">
                History
              </TabsTrigger>
            )}
          </TabsList>
        </div>
        <TabsContent value="overview">
          <OverviewTab doc={doc} />
        </TabsContent>
        <TabsContent value="versions">
          <VersionsTab doc={doc} />
        </TabsContent>
        {canReport && (
          <TabsContent value="acknowledgements">
            <AcknowledgementsTab doc={doc} />
          </TabsContent>
        )}
        {canReport && (
          <TabsContent value="history">
            <HistoryTab documentId={doc.id} />
          </TabsContent>
        )}
      </Tabs>
    </>
  );
}
