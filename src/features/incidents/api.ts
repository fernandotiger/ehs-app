"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { Paginated } from "@/lib/validation/common";
import type {
  ActionCreateInput,
  ActionListQuery,
  ActionUpdateInput,
  FollowUpCreateInput,
  IncidentCreateInput,
  IncidentListQuery,
  IncidentTypeCreateInput,
  IncidentTypeUpdateInput,
  InvestigationSaveInput,
  ReportKey,
  TaskInput,
  TrendActionInput,
  TrendCriteriaInput,
} from "@/lib/validation/incidents";
import type {
  ActionDetailDto,
  ActionSummaryDto,
  IncidentDetailDto,
  IncidentListItem,
  IncidentOverviewDto,
  ReportResultDto,
  TaskListItem,
  TrendPreviewDto,
  TrendSnapshotDto,
} from "@/server/modules/incidents/incident.dto";
import type { IncidentWriteResult } from "@/server/modules/incidents/incident.service";
import type { IncidentTypeDto, ReportSetupTypeDto } from "@/server/modules/incidents/incident-type.service";

export type * from "@/server/modules/incidents/incident.dto";
export type { IncidentNextStep, LifecycleStage } from "@/server/modules/incidents/workflow";
export type { IncidentTypeDto, IncidentWriteResult, ReportSetupTypeDto };

/** Incident module – query keys and React Query hooks. */

export type IncidentListParams = Partial<Omit<IncidentListQuery, "page" | "pageSize">> & { page: number; pageSize: number };
export type ActionListParams = Partial<Omit<ActionListQuery, "page" | "pageSize">> & { page: number; pageSize: number };

export const incidentKeys = {
  all: ["incidents"] as const,
  list: (params: object) => ["incidents", "list", params] as const,
  detail: (id: string) => ["incidents", "detail", id] as const,
  history: (id: string, page: number) => ["incidents", "history", id, page] as const,
  overview: ["incidents", "overview"] as const,
  setup: ["incidents", "report-setup"] as const,
  types: (includeInactive: boolean) => ["incidents", "types", includeInactive] as const,
  actions: (params: object) => ["incidents", "actions", params] as const,
  tasks: (params: object) => ["incidents", "tasks", params] as const,
  action: (id: string) => ["incidents", "action", id] as const,
  report: (key: string, params: object) => ["incidents", "report", key, params] as const,
};

const noPersist = { persist: false } as const;

function clean<T extends object>(params: T): Record<string, string | number | boolean | undefined> {
  return Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== "")) as Record<string, string | number | boolean | undefined>;
}

export function toQueryString(params: object): string {
  return new URLSearchParams(Object.entries(clean(params)).map(([k, v]) => [k, String(v)])).toString();
}

// ── Reads ───────────────────────────────────────────────────────────────────

export function useIncidentOverview() {
  return useQuery({ queryKey: incidentKeys.overview, queryFn: ({ signal }) => api.get<IncidentOverviewDto>("/api/incidents/overview", undefined, signal) });
}

/** Report wizard setup – persisted so reports can be started offline. */
export function useReportSetup() {
  return useQuery({
    queryKey: incidentKeys.setup,
    queryFn: ({ signal }) => api.get<ReportSetupTypeDto[]>("/api/incidents/report-setup", undefined, signal),
    staleTime: 10 * 60_000,
  });
}

export function useIncidentTypes(includeInactive = false) {
  return useQuery({
    queryKey: incidentKeys.types(includeInactive),
    queryFn: ({ signal }) => api.get<IncidentTypeDto[]>("/api/incidents/types", includeInactive ? { includeInactive: "true" } : undefined, signal),
    staleTime: 5 * 60_000,
  });
}

export function useIncidents(params: IncidentListParams) {
  return useQuery({
    queryKey: incidentKeys.list(params),
    queryFn: ({ signal }) => api.get<Paginated<IncidentListItem>>("/api/incidents", clean(params), signal),
    placeholderData: keepPreviousData,
  });
}

export function useIncident(id: string) {
  return useQuery({ queryKey: incidentKeys.detail(id), queryFn: ({ signal }) => api.get<IncidentDetailDto>(`/api/incidents/${id}`, undefined, signal) });
}

export interface HistoryEntry {
  id: string;
  entityType: string;
  action: string;
  actorName: string | null;
  changes: unknown;
  metadata: unknown;
  createdAt: string;
}

export function useIncidentHistory(id: string, page: number) {
  return useQuery({
    queryKey: incidentKeys.history(id, page),
    queryFn: ({ signal }) => api.get<Paginated<HistoryEntry>>(`/api/incidents/${id}/history`, { page, pageSize: 25 }, signal),
    placeholderData: keepPreviousData,
    meta: noPersist,
  });
}

export function useActions(params: ActionListParams, enabled = true) {
  return useQuery({
    queryKey: incidentKeys.actions(params),
    queryFn: ({ signal }) => api.get<Paginated<ActionSummaryDto>>("/api/incidents/actions", clean(params), signal),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useTasks(params: ActionListParams) {
  return useQuery({
    queryKey: incidentKeys.tasks(params),
    queryFn: ({ signal }) => api.get<Paginated<TaskListItem>>("/api/incidents/actions/tasks", clean(params), signal),
    placeholderData: keepPreviousData,
  });
}

export function useAction(id: string) {
  return useQuery({ queryKey: incidentKeys.action(id), queryFn: ({ signal }) => api.get<ActionDetailDto>(`/api/incidents/actions/${id}`, undefined, signal) });
}

export function useReport(key: ReportKey, params: { from: string; to: string; siteId?: string }, enabled = true) {
  return useQuery({
    queryKey: incidentKeys.report(key, params),
    queryFn: ({ signal }) => api.get<ReportResultDto>(`/api/incidents/reports/${key}`, clean(params), signal),
    enabled,
    meta: noPersist,
  });
}

// ── Writes ──────────────────────────────────────────────────────────────────

function useInvalidate() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: incidentKeys.all });
}

export function useCreateIncident() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: (input: IncidentCreateInput) => api.post<IncidentWriteResult>("/api/incidents", input), onSuccess: invalidate });
}

export type IncidentUpdatePayload = Omit<IncidentCreateInput, "clientId" | "formVersionId" | "submit" | "evidenceUploadIds"> & { expectedVersion: number };

export function useUpdateIncident(id: string) {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: (input: IncidentUpdatePayload) => api.put<IncidentWriteResult>(`/api/incidents/${id}`, input), onSuccess: invalidate });
}

export type IncidentCommand = "submit" | "archive" | "restore" | "close" | "reopen";

export function useIncidentCommand(id: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ command, ...body }: { command: IncidentCommand; expectedVersion: number; note?: string; reason?: string }) => api.post<unknown>(`/api/incidents/${id}/${command}`, body),
    onSuccess: invalidate,
  });
}

export function useStartInvestigation(id: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: { formVersionId?: string | null; investigatorId?: string | null }) => api.post<void>(`/api/incidents/${id}/investigation`, body),
    onSuccess: invalidate,
  });
}

export function useSaveInvestigation(id: string) {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: (body: InvestigationSaveInput) => api.put<void>(`/api/incidents/${id}/investigation`, body), onSuccess: invalidate });
}

export function useReopenInvestigation(id: string) {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: (expectedVersion: number) => api.post<void>(`/api/incidents/${id}/investigation/reopen`, { expectedVersion }), onSuccess: invalidate });
}

export function useCreateAction() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: (input: ActionCreateInput) => api.post<{ id: string; reference: string }>("/api/incidents/actions", input), onSuccess: invalidate });
}

export function useUpdateAction(id: string) {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: (input: ActionUpdateInput) => api.put<void>(`/api/incidents/actions/${id}`, input), onSuccess: invalidate });
}

export function useFollowUp(id: string) {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: (input: FollowUpCreateInput) => api.post<{ id: string; reference: string }>(`/api/incidents/actions/${id}/follow-ups`, input), onSuccess: invalidate });
}

export type ActionCommand =
  | { command: "start"; expectedVersion: number }
  | { command: "complete"; expectedVersion: number; completionComment: string; reviewerId?: string | null; plannedReviewDate?: string | null }
  | { command: "review"; expectedVersion: number; outcome: "EFFECTIVE" | "INEFFECTIVE"; comment: string }
  | { command: "link"; incidentId: string }
  | { command: "unlink"; incidentId: string }
  | { command: "trend"; expectedVersion: number };

export function useActionCommand(id: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ command, ...body }: ActionCommand) => api.post<TrendSnapshotDto | void>(`/api/incidents/actions/${id}/${command}`, body),
    onSuccess: invalidate,
  });
}

/** Link an existing action to an incident (called from the incident's Actions tab). */
export function useLinkAction() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ actionId, incidentId }: { actionId: string; incidentId: string }) => api.post<void>(`/api/incidents/actions/${actionId}/link`, { incidentId }),
    onSuccess: invalidate,
  });
}

export function useSaveTask(actionId: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ taskId, ...input }: TaskInput & { taskId?: string }) =>
      taskId ? api.put<void>(`/api/incidents/actions/${actionId}/tasks/${taskId}`, input).then(() => ({ id: taskId })) : api.post<{ id: string }>(`/api/incidents/actions/${actionId}/tasks`, input),
    onSuccess: invalidate,
  });
}

export function useCompleteTask() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ actionId, taskId, completionComment }: { actionId: string; taskId: string; completionComment: string }) =>
      api.post<void>(`/api/incidents/actions/${actionId}/tasks/${taskId}/complete`, { completionComment }),
    onSuccess: invalidate,
  });
}

export function useTrendPreview() {
  return useMutation({ mutationFn: (criteria: TrendCriteriaInput) => api.post<TrendPreviewDto>("/api/incidents/trends", criteria) });
}

export function useCreateTrendAction() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: (input: TrendActionInput) => api.post<{ id: string; reference: string }>("/api/incidents/trends/actions", input), onSuccess: invalidate });
}

// ── Configuration ───────────────────────────────────────────────────────────

/** Resolves after the type lists are refetched, so the new type can be selected straight away. */
export function useCreateIncidentType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: IncidentTypeCreateInput) => api.post<IncidentTypeDto>("/api/incidents/types", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["incidents"] }),
  });
}

export function useUpdateIncidentType(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: IncidentTypeUpdateInput) => api.patch<IncidentTypeDto>(`/api/incidents/types/${id}`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["incidents"] }),
  });
}

export function useSubtypeMutation(typeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { subtypeId?: string; name?: string; isActive?: boolean }) =>
      input.subtypeId
        ? api.patch<IncidentTypeDto>(`/api/incidents/types/${typeId}/subtypes/${input.subtypeId}`, { name: input.name, isActive: input.isActive })
        : api.post<IncidentTypeDto>(`/api/incidents/types/${typeId}/subtypes`, { name: input.name }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["incidents"] }),
  });
}
