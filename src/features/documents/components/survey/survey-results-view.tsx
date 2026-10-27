"use client";

import { BarChart3, ChevronDown, Download, EyeOff, Printer, UserCheck, UserX, Users } from "lucide-react";
import { useState } from "react";
import { PaginationBar } from "@/components/common/pagination-bar";
import { StatCard } from "@/components/common/stat-card";
import { EmptyState, ErrorState, LoadingRows } from "@/components/common/states";
import { StatusBadge } from "@/components/common/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { formatDate } from "../../format";
import { surveyExportUrl, useSurveyResults, useSurveyTextAnswers, type SurveyQuestionResult, type SurveyTextAnswerDto } from "../../survey-api";
import { QUESTION_TYPE_META } from "../../survey-format";
import { answersLabel } from "./survey-indicator";

const TEXT_PAGE = 20;

function TextAnswer({ answer }: { answer: SurveyTextAnswerDto }) {
  return (
    <li className="rounded-lg bg-muted/50 p-3 text-sm">
      <p className="whitespace-pre-wrap break-words">{answer.text}</p>
      <p className="mt-1.5 text-xs text-muted-foreground">
        {answer.respondent ? (
          <>
            — <span className="font-medium text-foreground">{answer.respondent.name}</span>
            {answer.submittedOn ? ` · ${formatDate(answer.submittedOn)}` : ""}
            {answer.documentVersionNumber ? ` · version ${answer.documentVersionNumber}` : ""}
          </>
        ) : (
          <span className="inline-flex items-center gap-1">
            — <EyeOff className="size-3" /> Anonymous
          </span>
        )}
      </p>
    </li>
  );
}

/** Text answers: the first few come with the results; "Show more" pages through all of them (alphabetical). */
function TextAnswers({ documentId, surveyId, question }: { documentId: string; surveyId?: string; question: SurveyQuestionResult }) {
  const [page, setPage] = useState(0);
  const more = useSurveyTextAnswers(documentId, { questionId: question.id, surveyId, page: Math.max(1, page), pageSize: TEXT_PAGE }, page > 0);
  if (!question.answered) return <p className="text-sm text-muted-foreground">No written answers yet.</p>;
  if (page === 0 || !more.data) {
    return (
      <div className="space-y-2">
        <ul className="space-y-2">
          {question.textAnswers.map((a, i) => (
            <TextAnswer key={i} answer={a} />
          ))}
        </ul>
        {question.textAnswers.length < question.answered && (
          <Button type="button" variant="outline" size="sm" disabled={more.isFetching} onClick={() => setPage(1)}>
            {more.isFetching ? <Spinner /> : <ChevronDown />} Show more ({question.answered - question.textAnswers.length} more)
          </Button>
        )}
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <ul className="space-y-2">
        {more.data.items.map((a, i) => (
          <TextAnswer key={`${page}-${i}`} answer={a} />
        ))}
      </ul>
      <PaginationBar page={page} pageSize={TEXT_PAGE} total={more.data.total} onPageChange={setPage} />
    </div>
  );
}

function ChoiceBars({ question }: { question: SurveyQuestionResult }) {
  return (
    <ul className="space-y-2.5">
      {question.options.map((o) => (
        <li key={o.label}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 break-words">{o.label}</span>
            <span className="shrink-0 tabular-nums text-muted-foreground">
              <span className="font-semibold text-foreground">{o.count}</span> · {o.percent}%
            </span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-muted" role="img" aria-label={`${o.label}: ${o.count} (${o.percent}%)`}>
            <div className="h-full rounded-full bg-brand print:bg-black" style={{ width: `${Math.max(o.count ? 2 : 0, o.percent)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Summary of a survey's answers for the document's creator (current or a previous survey). */
export function SurveyResultsView({ documentId, surveyId }: { documentId: string; surveyId?: string }) {
  const query = useSurveyResults(documentId, surveyId);

  if (query.isPending) return <LoadingRows rows={4} className="[&>*]:h-24" />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  const r = query.data;
  const t = r.totals;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard label="Answers" value={t.participants.toLocaleString()} hint={t.participants ? "took part" : "nobody yet"} icon={UserCheck} tone="success" />
        <StatCard label="Answer rate" value={`${t.answerRate}%`} hint={`${t.answeredInAudience.toLocaleString()} of ${t.audience.toLocaleString()}`} icon={Users} tone="info" />
        {t.notAnswered !== null && (
          <StatCard label="Not answered" value={t.notAnswered.toLocaleString()} hint="Everyone must answer" icon={UserX} tone={t.notAnswered ? "warning" : "success"} className="col-span-2 lg:col-span-1" />
        )}
      </div>

      {r.anonymity.notice && (
        <Alert className="border-info/40 bg-info/10">
          <EyeOff />
          <AlertTitle>Some anonymous answers are not shown yet</AlertTitle>
          <AlertDescription>
            {r.anonymity.notice} This protects people in small teams from being recognised. The threshold is set in Configuration → System settings.
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Showing {answersLabel(t.shownResponses)}
          {t.anonymousShown ? `, including ${t.anonymousShown} anonymous` : ""}.
        </p>
        <div className="flex gap-2 print:hidden">
          <Button asChild variant="outline" size="sm">
            <a href={surveyExportUrl(documentId, surveyId)} download>
              <Download /> Export CSV
            </a>
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => window.print()}>
            <Printer /> Print
          </Button>
        </div>
      </div>

      {t.shownResponses === 0 ? (
        <EmptyState
          icon={BarChart3}
          title="No answers to show yet"
          description={r.anonymity.hidden ? "The anonymous answers appear here once there are enough of them to keep everyone anonymous." : "Results appear here as soon as people answer."}
        />
      ) : (
        <ol className="space-y-4">
          {r.questions.map((q) => (
            <li key={q.id}>
              <Card className="break-inside-avoid">
                <CardHeader>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge tone="brand">Question {q.position}</StatusBadge>
                    <StatusBadge>{QUESTION_TYPE_META[q.type].label}</StatusBadge>
                  </div>
                  <CardTitle className="mt-1 leading-snug">{q.label}</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    {q.answered.toLocaleString()} {q.answered === 1 ? "person" : "people"} answered{q.required ? "" : " (optional question)"}
                    {q.type === "MULTIPLE" ? " · people could pick more than one, so the percentages can add up to more than 100%" : ""}
                  </p>
                </CardHeader>
                <CardContent>{q.type === "TEXT" ? <TextAnswers documentId={documentId} surveyId={surveyId} question={q} /> : <ChoiceBars question={q} />}</CardContent>
              </Card>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
