"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { Paginated } from "@/lib/validation/common";
import type { ActionCancelInput, ActionCompleteInput, ActionCreateInput, ActionListQuery, ActionUpdateInput } from "@/lib/validation/actions";
import type { ActionDetailDto, ActionHistoryEntry, ActionListItem, ActionSummaryDto } from "@/server/modules/actions/action.dto";

export type * from "@/server/modules/actions/action.dto";
export type { ActionCommand, LifecycleStep } from "@/server/modules/actions/workflow";

/** Actions module – query keys and React Query hooks. */

export type ActionListParams = Partial<Omit<ActionListQuery, "page" | "pageSize">> & { page: number; pageSize: number };

export const actionKeys = {
  all: ["actions"] as const,
  list: (params: object) => ["actions", "list", params] as const,
  summary: ["actions", "summary"] as const,
  detail: (id: string) => ["actions", "detail", id] as const,
  history: (id: string, page: number) => ["actions", "history", id, page] as const,
};

const noPersist = { persist: false } as const;

function clean<T extends object>(params: T): Record<string, string | number | boolean | undefined> {
  return Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== "")) as Record<string, string | number | boolean | undefined>;
}

// ── Reads ───────────────────────────────────────────────────────────────────

export function useActionList(params: ActionListParams) {
  return useQuery({
    queryKey: actionKeys.list(params),
    queryFn: ({ signal }) => api.get<Paginated<ActionListItem>>("/api/actions", clean(params), signal),
    placeholderData: keepPreviousData,
  });
}

export function useActionSummary(enabled = true) {
  return useQuery({ queryKey: actionKeys.summary, queryFn: ({ signal }) => api.get<ActionSummaryDto>("/api/actions/summary", undefined, signal), enabled });
}

export function useAction(id: string) {
  return useQuery({ queryKey: actionKeys.detail(id), queryFn: ({ signal }) => api.get<ActionDetailDto>(`/api/actions/${id}`, undefined, signal) });
}

export function useActionHistory(id: string, page: number) {
  return useQuery({
    queryKey: actionKeys.history(id, page),
    queryFn: ({ signal }) => api.get<Paginated<ActionHistoryEntry>>(`/api/actions/${id}/history`, { page, pageSize: 25 }, signal),
    placeholderData: keepPreviousData,
    meta: noPersist,
  });
}

// ── Writes ──────────────────────────────────────────────────────────────────

function useInvalidate() {
  const qc = useQueryClient();
  return () => Promise.all([qc.invalidateQueries({ queryKey: actionKeys.all }), qc.invalidateQueries({ queryKey: ["my-work"] })]);
}

export function useCreateAction() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: (input: ActionCreateInput) => api.post<{ id: string; reference: string }>("/api/actions", input), onSuccess: invalidate });
}

export function useUpdateAction(id: string) {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: (input: ActionUpdateInput) => api.put<void>(`/api/actions/${id}`, input), onSuccess: invalidate });
}

export function useStartAction(id: string) {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: (expectedVersion: number) => api.post<void>(`/api/actions/${id}/start`, { expectedVersion }), onSuccess: invalidate });
}

export function useCompleteAction(id: string) {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: (input: ActionCompleteInput) => api.post<void>(`/api/actions/${id}/complete`, input), onSuccess: invalidate });
}

export function useCancelAction(id: string) {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: (input: ActionCancelInput) => api.post<void>(`/api/actions/${id}/cancel`, input), onSuccess: invalidate });
}

export function useReopenAction(id: string) {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: (expectedVersion: number) => api.post<void>(`/api/actions/${id}/reopen`, { expectedVersion }), onSuccess: invalidate });
}
