"use client";

import { ArrowLeft, BarChart3, ClipboardList, History, Lock, LockOpen, PencilLine, Users } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { EmptyState, ErrorState, LoadingRows } from "@/components/common/states";
import { StatusBadge } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { errorMessage } from "@/lib/api-client";
import type { ManageDocumentDto } from "@/server/modules/documents/document.dto";
import { formatDate } from "../../format";
import { useDocumentSurvey, useSurveyOpenState, type DocumentSurveyManageDto, type SurveyDto } from "../../survey-api";
import { questionsLabel } from "../../survey-format";
import { SurveyEditView } from "./survey-edit-view";
import { answersLabel } from "./survey-indicator";
import { SurveyParticipationView } from "./survey-participation-view";
import { SurveyResultsView } from "./survey-results-view";

type View = "results" | "people" | "edit" | "previous";

function SurveySummaryCard({ doc, survey, canManage }: { doc: ManageDocumentDto; survey: SurveyDto; canManage: boolean }) {
  const openState = useSurveyOpenState(doc.id);
  const run = async (action: "close" | "reopen") => {
    try {
      await openState.mutateAsync({ action, expectedVersion: survey.version });
      toast.success(action === "close" ? "Survey closed – no more answers are accepted." : "Survey reopened.");
    } catch (error) {
      toast.error(errorMessage(error));
    }
  };
  const live = doc.status === "PUBLISHED";

  return (
    <Card size="sm">
      <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-brand uppercase">
            <ClipboardList className="size-4" /> Survey
          </p>
          <p className="mt-0.5 font-semibold leading-snug">{survey.title}</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {survey.status === "ACTIVE" ? (
              <StatusBadge tone={live ? "success" : "neutral"} dot>
                {live ? "Open" : "Goes live when published"}
              </StatusBadge>
            ) : (
              <StatusBadge tone="neutral" dot>
                Closed{survey.closedAt ? ` ${formatDate(survey.closedAt)}` : ""}
              </StatusBadge>
            )}
            <StatusBadge tone={survey.isMandatory ? "warning" : "brand"}>
              {survey.isMandatory ? `Everyone must answer · within ${survey.effectiveDueDays} days` : "Optional"}
            </StatusBadge>
            {survey.allowAnonymous && <StatusBadge>Anonymous answers allowed</StatusBadge>}
            <StatusBadge>{questionsLabel(survey.questions.length)}</StatusBadge>
            <StatusBadge>{answersLabel(survey.participantCount)}</StatusBadge>
          </div>
        </div>
        {canManage && doc.status !== "ARCHIVED" && (
          <div className="shrink-0">
            {survey.status === "ACTIVE" ? (
              <ConfirmDialog
                trigger={
                  <Button variant="outline" disabled={openState.isPending}>
                    <Lock /> Close survey
                  </Button>
                }
                title="Close the survey?"
                description="Nobody can answer any more. The answers so far are kept, and you can reopen the survey later."
                confirmLabel="Close survey"
                onConfirm={() => run("close")}
              />
            ) : (
              <Button variant="outline" disabled={openState.isPending} onClick={() => void run("reopen")}>
                <LockOpen /> Reopen survey
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PreviousSurveys({ documentId, data }: { documentId: string; data: DocumentSurveyManageDto }) {
  const [selected, setSelected] = useState<string | null>(null);
  const survey = data.previous.find((p) => p.id === selected);
  if (survey) {
    return (
      <div className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-semibold">{survey.title}</p>
            <p className="text-sm text-muted-foreground">
              Read-only · {formatDate(survey.createdAt)} – replaced {formatDate(survey.replacedAt)}
            </p>
          </div>
          <Button variant="outline" onClick={() => setSelected(null)}>
            <ArrowLeft /> All previous surveys
          </Button>
        </div>
        <SurveyResultsView documentId={documentId} surveyId={survey.id} />
      </div>
    );
  }
  if (!data.previous.length) return <EmptyState icon={History} title="No previous surveys" description="When you replace a survey, the old one and its answers are kept here." />;
  return (
    <Card className="gap-0 py-0">
      <ul className="divide-y">
        {data.previous.map((p) => (
          <li key={p.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="font-medium">{p.title}</p>
              <p className="text-sm text-muted-foreground">
                {formatDate(p.createdAt)} – replaced {formatDate(p.replacedAt)} · {answersLabel(p.participantCount)}
              </p>
            </div>
            <Button variant="outline" onClick={() => setSelected(p.id)}>
              <BarChart3 /> View results
            </Button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** Manage page → Survey tab: Results · Who has answered · Edit survey · Previous surveys. New surveys come from the Survey page. */
export function SurveyTab({ doc, canManage, canReport }: { doc: ManageDocumentDto; canManage: boolean; canReport: boolean }) {
  const query = useDocumentSurvey(doc.id);
  const [view, setView] = useState<View>(canReport ? "results" : "edit");

  if (query.isPending) return <LoadingRows rows={4} className="[&>*]:h-24" />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  const data = query.data;
  const survey = data.current;

  if (!survey) {
    return (
      <div className="space-y-6">
        <EmptyState icon={ClipboardList} title="No survey" description="This document has no survey. New surveys are created on the Survey page." />
        {data.previous.length > 0 && (
          <div className="space-y-2">
            <h3 className="font-semibold">Previous surveys</h3>
            <PreviousSurveys documentId={doc.id} data={data} />
          </div>
        )}
      </div>
    );
  }

  const views: { value: View; label: string; icon: typeof Users; show: boolean }[] = [
    { value: "results", label: "Results", icon: BarChart3, show: canReport },
    { value: "people", label: "Who has answered", icon: Users, show: canReport },
    { value: "edit", label: "Edit survey", icon: PencilLine, show: canManage && doc.status !== "ARCHIVED" },
    { value: "previous", label: `Previous surveys${data.previous.length ? ` (${data.previous.length})` : ""}`, icon: History, show: canReport && data.previous.length > 0 },
  ];
  const visible = views.filter((v) => v.show);
  const current = visible.some((v) => v.value === view) ? view : (visible[0]?.value ?? "results");

  return (
    <div className="space-y-4">
      <SurveySummaryCard doc={doc} survey={survey} canManage={canManage} />
      {visible.length > 1 && (
        <div className="-mx-3 overflow-x-auto overflow-y-hidden px-3 pb-1.5 md:mx-0 md:px-0">
          <Tabs value={current} onValueChange={(v) => setView(v as View)}>
            <TabsList variant="line" className="h-9">
              {visible.map((v) => (
                <TabsTrigger key={v.value} value={v.value} className="px-3">
                  <v.icon /> {v.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
      )}
      {current === "results" && <SurveyResultsView documentId={doc.id} />}
      {current === "people" && (
        <SurveyParticipationView documentId={doc.id} survey={survey} canRemind={survey.isMandatory && survey.status === "ACTIVE" && doc.status === "PUBLISHED"} />
      )}
      {current === "edit" && (
        <SurveyEditView key={`${survey.id}:${survey.version}`} doc={doc} survey={survey} onDone={() => setView("results")} onReload={() => void query.refetch()} />
      )}
      {current === "previous" && <PreviousSurveys documentId={doc.id} data={data} />}
    </div>
  );
}
