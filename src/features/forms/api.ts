"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { FormFieldDefinition } from "@/lib/forms";
import type { QuestionnaireSnapshot } from "@/lib/forms/questionnaire";
import type { FormCreateInput } from "@/lib/validation/forms";
import type { FormDetailDto, FormSummaryDto, FormVersionDto, PublishedFormDto, ReusableQuestionDto } from "@/server/modules/forms/form.service";

export type { FormDetailDto, FormSummaryDto, FormVersionDto, PublishedFormDto, ReusableQuestionDto };

/** Form Builder – query keys and hooks. */
export const formKeys = {
  all: ["forms"] as const,
  library: (params: object) => ["forms", "library", params] as const,
  detail: (id: string) => ["forms", "detail", id] as const,
  published: (module: string, purpose?: string, siteId?: string) => ["forms", "published", module, purpose ?? "", siteId ?? ""] as const,
  version: (id: string) => ["forms", "version", id] as const,
  snapshot: (id: string, siteId?: string | null) => ["forms", "snapshot", id, siteId ?? ""] as const,
  questions: (q: string, excludeFormId?: string) => ["forms", "questions", q, excludeFormId ?? ""] as const,
};

const noPersist = { persist: false } as const;

export function useFormLibrary(params: { q?: string; module?: string }) {
  return useQuery({
    queryKey: formKeys.library(params),
    queryFn: ({ signal }) => api.get<FormSummaryDto[]>("/api/forms", params, signal),
    meta: noPersist,
  });
}

export function useFormDetail(id: string | null | undefined) {
  return useQuery({
    queryKey: formKeys.detail(id ?? ""),
    queryFn: ({ signal }) => api.get<FormDetailDto>(`/api/forms/${id}`, undefined, signal),
    enabled: Boolean(id),
    meta: noPersist,
  });
}

function useInvalidateForms() {
  const qc = useQueryClient();
  return (form?: FormDetailDto) => {
    if (form) qc.setQueryData(formKeys.detail(form.id), form);
    void qc.invalidateQueries({ queryKey: formKeys.all });
  };
}

export function useCreateForm() {
  const invalidate = useInvalidateForms();
  return useMutation({
    mutationFn: (input: FormCreateInput) => api.post<FormDetailDto>("/api/forms", input),
    onSuccess: (form) => invalidate(form),
  });
}

export interface DraftPayload {
  id: string;
  name?: string;
  fields: FormFieldDefinition[];
  settings: Record<string, unknown>;
  expectedVersion: number;
}

export function useSaveFormDraft() {
  const invalidate = useInvalidateForms();
  return useMutation({
    mutationFn: ({ id, ...body }: DraftPayload) => api.put<FormDetailDto>(`/api/forms/${id}`, body),
    onSuccess: (form) => invalidate(form),
  });
}

export function usePublishForm() {
  const invalidate = useInvalidateForms();
  return useMutation({
    mutationFn: ({ id, ...body }: Partial<DraftPayload> & { id: string; expectedVersion: number }) => api.post<FormDetailDto>(`/api/forms/${id}/publish`, body),
    onSuccess: (form) => invalidate(form),
  });
}

export function useSaveRiskRules() {
  const invalidate = useInvalidateForms();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; settings: Record<string, unknown>; expectedVersion: number }) => api.put<FormDetailDto>(`/api/forms/${id}/risk-rules`, body),
    onSuccess: (form) => invalidate(form),
  });
}

export function useReusableQuestions(q: string, excludeFormId?: string) {
  return useQuery({
    queryKey: formKeys.questions(q, excludeFormId),
    queryFn: ({ signal }) => api.get<ReusableQuestionDto[]>("/api/forms/questions", { q, excludeFormId }, signal),
    enabled: q.trim().length > 0,
    staleTime: 30_000,
    meta: noPersist,
  });
}

/** Compatible published forms for a workflow selector. */
export function usePublishedForms(module: string, purpose?: string, siteId?: string) {
  return useQuery({
    queryKey: formKeys.published(module, purpose, siteId),
    queryFn: ({ signal }) => api.get<PublishedFormDto[]>("/api/forms/published", { module, purpose, siteId }, signal),
    staleTime: 5 * 60_000,
  });
}

export function useFormVersion(versionId: string | null | undefined) {
  return useQuery({
    queryKey: formKeys.version(versionId ?? ""),
    queryFn: ({ signal }) => api.get<FormVersionDto>(`/api/forms/versions/${versionId}`, undefined, signal),
    enabled: Boolean(versionId),
    staleTime: Infinity,
  });
}

/** The questionnaire a new record at `siteId` would capture from this version. */
export function useQuestionnaireSnapshot(versionId: string | null | undefined, siteId?: string | null) {
  return useQuery({
    queryKey: formKeys.snapshot(versionId ?? "", siteId),
    queryFn: ({ signal }) => api.get<QuestionnaireSnapshot>(`/api/forms/versions/${versionId}/snapshot`, { siteId: siteId ?? undefined }, signal),
    enabled: Boolean(versionId),
    staleTime: 5 * 60_000,
  });
}
