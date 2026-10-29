"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { Paginated } from "@/lib/validation/common";
import type {
  ApplicabilityInput,
  ArticleInput,
  CategoryCreateInput,
  CategoryUpdateInput,
  LegislationInput,
  LegislationListQuery,
  LegislationUpdateInput,
  QuestionInput,
  RequirementAssessInput,
  RequirementInput,
  SettingsInput,
  SlawActionCompleteInput,
  SlawActionListQuery,
} from "@/lib/validation/simplified-law";
import type {
  SlawActionItem,
  SlawActionSummaryDto,
  SlawCategoryNode,
  SlawHistoryEntry,
  SlawLegislationDetailDto,
  SlawLegislationListItem,
  SlawSettingsDto,
  SlawSummaryDto,
} from "@/server/modules/simplified-law/slaw.dto";

export type * from "@/server/modules/simplified-law/slaw.dto";

/** Simplified law – query keys and React Query hooks. */

const BASE = "/api/simplified-law";

export type LegislationListParams = Partial<Omit<LegislationListQuery, "page" | "pageSize">> & { page: number; pageSize: number };
export type SlawActionListParams = Partial<Omit<SlawActionListQuery, "page" | "pageSize">> & { page: number; pageSize: number };

export const slawKeys = {
  all: ["simplified-law"] as const,
  summary: ["simplified-law", "summary"] as const,
  settings: ["simplified-law", "settings"] as const,
  categories: (archived: boolean) => ["simplified-law", "categories", archived] as const,
  list: (params: object) => ["simplified-law", "legislation", params] as const,
  detail: (id: string) => ["simplified-law", "detail", id] as const,
  history: (id: string, page: number) => ["simplified-law", "history", id, page] as const,
  actions: (params: object) => ["simplified-law", "actions", params] as const,
  action: (id: string) => ["simplified-law", "action", id] as const,
  actionSummary: ["simplified-law", "actions-summary"] as const,
};

const noPersist = { persist: false } as const;

function clean<T extends object>(params: T): Record<string, string | number | boolean | undefined> {
  return Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== "")) as Record<string, string | number | boolean | undefined>;
}

// ── Reads ───────────────────────────────────────────────────────────────────

export function useSlawSummary() {
  return useQuery({ queryKey: slawKeys.summary, queryFn: ({ signal }) => api.get<SlawSummaryDto>(`${BASE}/summary`, undefined, signal) });
}

export function useSlawSettings() {
  return useQuery({ queryKey: slawKeys.settings, queryFn: ({ signal }) => api.get<SlawSettingsDto>(`${BASE}/settings`, undefined, signal), staleTime: 60_000 });
}

export function useSlawCategories(archived = false, enabled = true) {
  return useQuery({
    queryKey: slawKeys.categories(archived),
    queryFn: ({ signal }) => api.get<SlawCategoryNode[]>(`${BASE}/categories`, archived ? { archived: "true" } : undefined, signal),
    enabled,
  });
}

export function useLegislationList(params: LegislationListParams) {
  return useQuery({
    queryKey: slawKeys.list(params),
    queryFn: ({ signal }) => api.get<Paginated<SlawLegislationListItem>>(`${BASE}/legislation`, clean(params), signal),
    placeholderData: keepPreviousData,
  });
}

export function useLegislation(id: string | null) {
  return useQuery({
    queryKey: slawKeys.detail(id ?? ""),
    queryFn: ({ signal }) => api.get<SlawLegislationDetailDto>(`${BASE}/legislation/${id}`, undefined, signal),
    enabled: Boolean(id),
  });
}

export function useLegislationHistory(id: string, page: number) {
  return useQuery({
    queryKey: slawKeys.history(id, page),
    queryFn: ({ signal }) => api.get<Paginated<SlawHistoryEntry>>(`${BASE}/legislation/${id}/history`, { page, pageSize: 25 }, signal),
    placeholderData: keepPreviousData,
    meta: noPersist,
  });
}

export function useSlawActions(params: SlawActionListParams) {
  return useQuery({
    queryKey: slawKeys.actions(params),
    queryFn: ({ signal }) => api.get<Paginated<SlawActionItem>>(`${BASE}/actions`, clean(params), signal),
    placeholderData: keepPreviousData,
  });
}

export function useSlawAction(id: string | null) {
  return useQuery({ queryKey: slawKeys.action(id ?? ""), queryFn: ({ signal }) => api.get<SlawActionItem>(`${BASE}/actions/${id}`, undefined, signal), enabled: Boolean(id), retry: false });
}

export function useSlawActionSummary() {
  return useQuery({ queryKey: slawKeys.actionSummary, queryFn: ({ signal }) => api.get<SlawActionSummaryDto>(`${BASE}/actions/summary`, undefined, signal) });
}

// ── Writes ──────────────────────────────────────────────────────────────────

function useInvalidate() {
  const qc = useQueryClient();
  return () => Promise.all([qc.invalidateQueries({ queryKey: slawKeys.all }), qc.invalidateQueries({ queryKey: ["my-work"] })]);
}

function useWrite<TInput, TResult = void>(fn: (input: TInput) => Promise<TResult>) {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: fn, onSuccess: invalidate });
}

export const useSaveApplicability = (id: string) => useWrite((input: ApplicabilityInput) => api.put<{ applicability: string; closedActions: number }>(`${BASE}/legislation/${id}/applicability`, input));
export const useAssessRequirement = () => useWrite(({ id, ...input }: RequirementAssessInput & { id: string }) => api.put<void>(`${BASE}/requirements/${id}`, input));
export const useCompleteSlawAction = () => useWrite(({ id, ...input }: SlawActionCompleteInput & { id: string }) => api.post<void>(`${BASE}/actions/${id}/complete`, input));

// Configuration
export const useSaveSettings = () => useWrite((input: SettingsInput) => api.put<void>(`${BASE}/settings`, input));
export const useCreateCategory = () => useWrite((input: CategoryCreateInput) => api.post<{ id: string }>(`${BASE}/config/categories`, input));
export const useUpdateCategory = () => useWrite(({ id, ...input }: CategoryUpdateInput & { id: string }) => api.put<void>(`${BASE}/config/categories/${id}`, input));
export const useMoveCategory = () => useWrite(({ id, direction }: { id: string; direction: "up" | "down" }) => api.post<void>(`${BASE}/config/categories/${id}/move`, { direction }));
export const useArchiveCategory = () => useWrite(({ id, archived }: { id: string; archived: boolean }) => api.post<void>(`${BASE}/config/categories/${id}/archive`, { archived }));
export const useCreateLegislation = () => useWrite((input: LegislationInput) => api.post<{ id: string }>(`${BASE}/config/legislation`, input));
export const useUpdateLegislation = (id: string) => useWrite((input: LegislationUpdateInput) => api.put<{ closedActions: number }>(`${BASE}/config/legislation/${id}`, input));
export const useArchiveLegislation = (id: string) => useWrite((archived: boolean) => api.post<void>(`${BASE}/config/legislation/${id}/archive`, { archived }));

export type ContentKind = "articles" | "questions" | "requirements";
export type ContentInput = { articles: ArticleInput; questions: QuestionInput; requirements: RequirementInput };

export const useAddContent = <K extends ContentKind>(legislationId: string, kind: K) => useWrite((input: ContentInput[K]) => api.post<{ id: string }>(`${BASE}/config/legislation/${legislationId}/${kind}`, input));
export const useUpdateContent = <K extends ContentKind>(kind: K) => useWrite(({ id, input }: { id: string; input: ContentInput[K] }) => api.put<void>(`${BASE}/config/${kind}/${id}`, input));
export const useRemoveContent = (kind: ContentKind) => useWrite((id: string) => api.delete<void>(`${BASE}/config/${kind}/${id}`));
export const useMoveContent = (kind: ContentKind) => useWrite(({ id, direction }: { id: string; direction: "up" | "down" }) => api.post<void>(`${BASE}/config/${kind}/${id}/move`, { direction }));

export const useAddJurisdiction = () => useWrite((name: string) => api.post<void>(`${BASE}/config/jurisdictions`, { name }));
export const useRenameJurisdiction = () => useWrite((input: { from: string; to: string }) => api.post<{ laws: number }>(`${BASE}/config/jurisdictions/rename`, input));
export const useRemoveJurisdiction = () => useWrite((name: string) => api.post<void>(`${BASE}/config/jurisdictions/remove`, { name }));
export const useMoveJurisdiction = () => useWrite((input: { name: string; direction: "up" | "down" }) => api.post<void>(`${BASE}/config/jurisdictions/move`, input));
