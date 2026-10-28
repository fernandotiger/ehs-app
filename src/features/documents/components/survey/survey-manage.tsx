"use client";

import { FileSearch } from "lucide-react";
import { useState } from "react";
import { EmptyState, ErrorState, LoadingRows } from "@/components/common/states";
import { StatusBadge } from "@/components/common/status-badge";
import { PageHeader } from "@/components/layout/page-header";
import { useCurrentUser } from "@/components/providers/current-user-provider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ApiError } from "@/lib/api-client";
import { PERMISSIONS } from "@/lib/permissions";
import { useManageDocument } from "../../api";
import { DOCUMENT_STATUS_META } from "../../format";
import { AcknowledgementsTab } from "../manage/acknowledgements-tab";
import { DocumentActions } from "../manage/document-manage";
import { HistoryTab } from "../manage/history-tab";
import { OverviewTab } from "../manage/overview-tab";
import { VersionsTab } from "../manage/versions-tab";
import { SurveyIndicator } from "./survey-indicator";
import { SurveyTab } from "./survey-tab";

/**
 * Survey management page (Survey Library → a survey): Survey (results, who has answered, edit
 * questions, previous surveys) · Settings (who should answer, acknowledgement) · File ·
 * Acknowledgements (when required) · History. The survey's document details are never shown –
 * its title and introduction are edited with the questions.
 */
export function SurveyManage({ id }: { id: string }) {
  const query = useManageDocument(id);
  const { can, canAny } = useCurrentUser();
  const canReport = canAny([PERMISSIONS.DOCUMENTS_ACK_REPORTS, PERMISSIONS.DOCUMENTS_MANAGE]);
  const canManage = can(PERMISSIONS.DOCUMENTS_MANAGE);
  const [tab, setTab] = useState("survey");

  if (query.isPending) return <LoadingRows rows={6} className="[&>*:first-child]:h-20 [&>*]:h-24" />;
  if (query.isError) {
    if (query.error instanceof ApiError && query.error.status === 404) {
      return <EmptyState icon={FileSearch} title="Induction not found" className="mt-6" />;
    }
    return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  }

  const doc = query.data;
  const status = DOCUMENT_STATUS_META[doc.status];

  return (
    <>
      <PageHeader
        title={doc.title}
        backHref="/documents/surveys/library"
        backLabel="Induction Library"
        meta={
          <>
            <StatusBadge tone={status.tone} dot>
              {status.label}
            </StatusBadge>
            <SurveyIndicator survey={doc.survey} className="h-6 px-2.5 text-xs" />
            <StatusBadge>{doc.currentVersion ? `File · version ${doc.currentVersion.versionNumber}` : "No file"}</StatusBadge>
            {doc.requiresAcknowledgement && <StatusBadge tone="warning">Acknowledgement required</StatusBadge>}
          </>
        }
        actions={<DocumentActions doc={doc} />}
      />

      <Tabs value={tab} onValueChange={setTab} className="gap-4">
        <div className="-mx-3 overflow-x-auto overflow-y-hidden px-3 md:mx-0 md:px-0">
          <TabsList className="h-9">
            <TabsTrigger value="survey" className="px-3">
              Induction
              <span className="ml-1 rounded-full bg-brand-soft px-1.5 text-[0.7rem] font-semibold text-brand tabular-nums" title="Completed">
                {doc.survey?.participantCount ?? 0}
              </span>
            </TabsTrigger>
            <TabsTrigger value="settings" className="px-3">
              Settings
            </TabsTrigger>
            <TabsTrigger value="file" className="px-3">
              File
            </TabsTrigger>
            {canReport && doc.requiresAcknowledgement && (
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
        <TabsContent value="survey">
          <SurveyTab doc={doc} canManage={canManage} canReport={canReport} />
        </TabsContent>
        <TabsContent value="settings">
          <OverviewTab doc={doc} survey />
        </TabsContent>
        <TabsContent value="file">
          <VersionsTab doc={doc} survey />
        </TabsContent>
        {canReport && doc.requiresAcknowledgement && (
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
