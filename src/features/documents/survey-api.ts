"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { useCurrentUser } from "@/components/providers/current-user-provider";
import { api, ApiError } from "@/lib/api-client";
import { enqueue, useOutbox } from "@/lib/offline/outbox";
import type { Paginated } from "@/lib/validation/common";
import type { SurveyAnswerInput, SurveyDefinitionInput, SurveyParticipationStatus } from "@/lib/validation/document-surveys";
import type { MySurveyFilter } from "@/lib/validation/documents";
import type { MySurveysResponse } from "@/server/modules/documents/document.dto";
import type {
  DocumentSurveyManageDto,
  MySurveyDto,
  SurveyAnswerResult,
  SurveyParticipationDto,
  SurveyResultsDto,
  SurveyTextAnswerDto,
} from "@/server/modules/documents/survey.dto";
import { settingsKeys } from "@/features/shared/settings";
import { DEFAULT_DOCUMENT_SURVEY_SETTINGS, type DocumentSurveySettings } from "@/lib/settings/document-survey";
import { documentKeys } from "./api";

export type {
  DocumentSurveyManageDto,
  MySurveyDto,
  MySurveyStatus,
  MySurveySummaryDto,
  PreviousSurveyDto,
  SurveyDto,
  SurveyParticipantRow,
  SurveyParticipationDto,
  SurveyQuestionDto,
  SurveyQuestionResult,
  SurveyResultsDto,
  SurveySummaryDto,
  SurveyTextAnswerDto,
} from "@/server/modules/documents/survey.dto";

/** All survey keys live under ["documents", …] so document invalidations refresh them too. */
export const surveyKeys = {
  all: (documentId: string) => ["documents", "survey", documentId] as const,
  manage: (documentId: string) => ["documents", "survey", documentId, "manage"] as const,
  mine: (documentId: string) => ["documents", "survey", documentId, "mine"] as const,
  results: (documentId: string, surveyId?: string) => ["documents", "survey", documentId, "results", surveyId ?? "current"] as const,
  text: (documentId: string, params: object) => ["documents", "survey", documentId, "text", params] as const,
  participation: (documentId: string, params: object) => ["documents", "survey", documentId, "participation", params] as const,
};

export interface MySurveysParams {
  page: number;
  pageSize: number;
  q?: string;
  filter: MySurveyFilter;
}

/** My Surveys – surveys assigned to me (kept under ["documents", …] so answering refreshes it). */
export function useMySurveys(params: MySurveysParams) {
  return useQuery({
    queryKey: ["documents", "my-surveys", params] as const,
    queryFn: ({ signal }) => api.get<MySurveysResponse>("/api/documents/surveys/my", { ...params }, signal),
    placeholderData: keepPreviousData,
  });
}

export function surveyExportUrl(documentId: string, surveyId?: string): string {
  return `/api/documents/${documentId}/survey/export${surveyId ? `?surveyId=${encodeURIComponent(surveyId)}` : ""}`;
}

// ── Creator ─────────────────────────────────────────────────────────────────

/** The documentSurvey setting (default "answer within" days, anonymity threshold). */
export function useSurveySettings(): DocumentSurveySettings {
  const query = useQuery({
    queryKey: settingsKeys.one("documentSurvey"),
    queryFn: ({ signal }) => api.get<DocumentSurveySettings>("/api/configuration/settings/documentSurvey", undefined, signal),
    staleTime: 5 * 60_000,
  });
  return query.data ?? DEFAULT_DOCUMENT_SURVEY_SETTINGS;
}

export function useDocumentSurvey(documentId: string) {
  return useQuery({
    queryKey: surveyKeys.manage(documentId),
    queryFn: ({ signal }) => api.get<DocumentSurveyManageDto>(`/api/documents/${documentId}/survey`, undefined, signal),
    meta: { persist: false },
  });
}

export function useSurveyResults(documentId: string, surveyId?: string, enabled = true) {
  return useQuery({
    queryKey: surveyKeys.results(documentId, surveyId),
    queryFn: ({ signal }) => api.get<SurveyResultsDto>(`/api/documents/${documentId}/survey/results`, { surveyId }, signal),
    enabled,
    meta: { persist: false },
  });
}

export function useSurveyTextAnswers(documentId: string, params: { questionId: string; surveyId?: string; page: number; pageSize: number }, enabled: boolean) {
  return useQuery({
    queryKey: surveyKeys.text(documentId, params),
    queryFn: ({ signal }) => api.get<Paginated<SurveyTextAnswerDto>>(`/api/documents/${documentId}/survey/results/text`, { ...params }, signal),
    enabled,
    placeholderData: keepPreviousData,
    meta: { persist: false },
  });
}

export interface ParticipationParams {
  status: SurveyParticipationStatus;
  page: number;
  pageSize: number;
  q?: string;
  departmentId?: string;
  surveyId?: string;
}

export function useSurveyParticipation(documentId: string, params: ParticipationParams) {
  return useQuery({
    queryKey: surveyKeys.participation(documentId, params),
    queryFn: ({ signal }) => api.get<SurveyParticipationDto>(`/api/documents/${documentId}/survey/participation`, { ...params }, signal),
    placeholderData: keepPreviousData,
    meta: { persist: false },
  });
}

function useInvalidateDocuments() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: documentKeys.all });
}

export type SurveySaveResult = { id: string; version: number; notified: number };

/** Save changes to the document's survey (new surveys are created on the Survey page). */
export function useSaveSurvey(documentId: string) {
  const invalidate = useInvalidateDocuments();
  return useMutation({
    mutationFn: (input: { survey: SurveyDefinitionInput; expectedVersion: number }) => api.put<SurveySaveResult>(`/api/documents/${documentId}/survey`, input),
    onSuccess: () => void invalidate(),
  });
}

export function useReplaceSurvey(documentId: string) {
  const invalidate = useInvalidateDocuments();
  return useMutation({
    mutationFn: (input: { survey: SurveyDefinitionInput; expectedVersion?: number }) =>
      api.post<{ id: string; previousId: string; notified: number }>(`/api/documents/${documentId}/survey/replace`, input),
    onSuccess: () => void invalidate(),
  });
}

export function useSurveyOpenState(documentId: string) {
  const invalidate = useInvalidateDocuments();
  return useMutation({
    mutationFn: (input: { action: "close" | "reopen"; expectedVersion?: number }) =>
      api.post<{ id: string; status: string }>(`/api/documents/${documentId}/survey/${input.action}`, { expectedVersion: input.expectedVersion }),
    onSuccess: () => void invalidate(),
  });
}

export function useSurveyReminder(documentId: string) {
  return useMutation({
    mutationFn: () => api.post<{ notified: number }>(`/api/documents/${documentId}/survey/remind`),
  });
}

// ── Reader ──────────────────────────────────────────────────────────────────

/** The reader's survey card – persisted for offline reading. */
export function useMySurvey(documentId: string) {
  return useQuery({
    queryKey: surveyKeys.mine(documentId),
    queryFn: ({ signal }) => api.get<{ survey: MySurveyDto | null }>(`/api/documents/${documentId}/survey/mine`, undefined, signal),
  });
}

/** Document ids with survey answers waiting in the offline outbox. */
export function usePendingSurveyAnswers(): Set<string> {
  const { user } = useCurrentUser();
  const ops = useOutbox(user.id, "document.survey_answer");
  return useMemo(() => new Set(ops.map((o) => String(o.payload.documentId))), [ops]);
}

export type SurveyAnswerOutcome = { queued: true } | { queued: false; result: SurveyAnswerResult };

/**
 * Send answers. Offline (or when the request cannot reach the server) they are queued as
 * `document.survey_answer` and replayed on Sync – the participation key makes replays idempotent.
 */
export function useAnswerSurvey(document: { id: string; title: string }) {
  const qc = useQueryClient();
  const { user } = useCurrentUser();

  const queue = async (input: SurveyAnswerInput): Promise<SurveyAnswerOutcome> => {
    await enqueue({
      type: "document.survey_answer",
      payload: { ...input, documentId: document.id, clientAnsweredAt: new Date().toISOString() },
      label: `Induction answers for ${document.title}`,
      userId: user.id,
    });
    return { queued: true };
  };

  return useMutation({
    mutationFn: async (input: SurveyAnswerInput): Promise<SurveyAnswerOutcome> => {
      if (typeof navigator !== "undefined" && !navigator.onLine) return queue(input);
      try {
        const result = await api.post<SurveyAnswerResult>(`/api/documents/${document.id}/survey/answer`, input);
        return { queued: false, result };
      } catch (error) {
        if (error instanceof ApiError && error.isNetworkError) return queue(input);
        throw error;
      }
    },
    onSuccess: (outcome, input) => {
      if (outcome.queued) return;
      if (outcome.result.created) {
        // Show the receipt immediately; the refetch below confirms it.
        qc.setQueryData<{ survey: MySurveyDto | null }>(surveyKeys.mine(document.id), (old) =>
          old?.survey
            ? { survey: { ...old.survey, myStatus: "ANSWERED", dueAt: null, answered: { answeredAt: outcome.result.answeredAt, anonymous: input.anonymous } } }
            : old,
        );
      }
      void qc.invalidateQueries({ queryKey: documentKeys.all });
    },
  });
}
