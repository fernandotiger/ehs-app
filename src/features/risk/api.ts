"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { Paginated } from "@/lib/validation/common";
import type {
  AssessmentCreateInput,
  AssessmentListQuery,
  AssessmentUpdateInput,
  ObjectiveInput,
  PeriodicReviewInput,
  ProgrammeInput,
  RiskReportKey,
  StrategyListQuery,
  TargetInput,
  TaskCompleteInput,
  TaskCreateInput,
  TaskListQuery,
  TaskUpdateInput,
} from "@/lib/validation/risk";
import type { FormDetailDto } from "@/server/modules/forms/form.service";
import type { AssessmentWriteResult } from "@/server/modules/risk/assessment.service";
import type {
  AssessmentDetailDto,
  AssessmentListItem,
  HazardOptionDto,
  ObjectiveDetailDto,
  ObjectiveDto,
  ProgrammeDetailDto,
  ProgrammeDto,
  RiskFormRulesDto,
  RiskOverviewDto,
  RiskReportResultDto,
  ScanResultDto,
  TargetDetailDto,
  TargetDto,
  TaskDetailDto,
  TaskListItem,
} from "@/server/modules/risk/risk.dto";

export type * from "@/server/modules/risk/risk.dto";
export type { AssessmentNextStep, LifecycleStage } from "@/server/modules/risk/workflow";
export type { AssessmentWriteResult };

/** Risk module – query keys and React Query hooks. */

export type AssessmentListParams = Partial<Omit<AssessmentListQuery, "page" | "pageSize">> & { page: number; pageSize: number };
export type TaskListParams = Partial<Omit<TaskListQuery, "page" | "pageSize">> & { page: number; pageSize: number };
export type StrategyListParams = Partial<Omit<StrategyListQuery, "page" | "pageSize">> & { page: number; pageSize: number };

export const riskKeys = {
  all: ["risk"] as const,
  overview: ["risk", "overview"] as const,
  assessments: (params: object) => ["risk", "assessments", params] as const,
  assessment: (id: string) => ["risk", "assessment", id] as const,
  history: (id: string, page: number) => ["risk", "history", id, page] as const,
  tasks: (params: object) => ["risk", "tasks", params] as const,
  task: (id: string) => ["risk", "task", id] as const,
  objectives: (params: object) => ["risk", "objectives", params] as const,
  objective: (id: string) => ["risk", "objective", id] as const,
  targets: (params: object) => ["risk", "targets", params] as const,
  target: (id: string) => ["risk", "target", id] as const,
  programmes: (params: object) => ["risk", "programmes", params] as const,
  programme: (id: string) => ["risk", "programme", id] as const,
  report: (key: string, params: object) => ["risk", "report", key, params] as const,
  /** Under "forms" so Form Builder mutations (risk rules) refresh it too. */
  matrix: ["forms", "risk-matrix"] as const,
  matrixForm: (id: string) => ["forms", "risk-matrix", id] as const,
  /** Configuration → Risk matrix: a form's hazard / aspect options. */
  matrixHazards: (formId: string) => ["forms", "risk-matrix", formId, "hazards"] as const,
  /** Assessment wizard: active options of the form version (under "risk" so option edits refresh it). */
  hazardOptions: (versionId: string) => ["risk", "hazard-options", versionId] as const,
};

const noPersist = { persist: false } as const;

export function clean<T extends object>(params: T): Record<string, string | number | boolean | undefined> {
  return Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== "")) as Record<string, string | number | boolean | undefined>;
}

export function toQueryString(params: object): string {
  return new URLSearchParams(Object.entries(clean(params)).map(([k, v]) => [k, String(v)])).toString();
}

// ── Reads ───────────────────────────────────────────────────────────────────

export function useRiskOverview(enabled = true) {
  return useQuery({ queryKey: riskKeys.overview, queryFn: ({ signal }) => api.get<RiskOverviewDto>("/api/risk/overview", undefined, signal), enabled });
}

export function useAssessments(params: AssessmentListParams, enabled = true) {
  return useQuery({
    queryKey: riskKeys.assessments(params),
    queryFn: ({ signal }) => api.get<Paginated<AssessmentListItem>>("/api/risk/assessments", clean(params), signal),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useAssessment(id: string | null | undefined) {
  return useQuery({ queryKey: riskKeys.assessment(id ?? ""), queryFn: ({ signal }) => api.get<AssessmentDetailDto>(`/api/risk/assessments/${id}`, undefined, signal), enabled: Boolean(id) });
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

export function useAssessmentHistory(id: string, page: number) {
  return useQuery({
    queryKey: riskKeys.history(id, page),
    queryFn: ({ signal }) => api.get<Paginated<HistoryEntry>>(`/api/risk/assessments/${id}/history`, { page, pageSize: 25 }, signal),
    placeholderData: keepPreviousData,
    meta: noPersist,
  });
}

export function useRiskTasks(params: TaskListParams, enabled = true) {
  return useQuery({
    queryKey: riskKeys.tasks(params),
    queryFn: ({ signal }) => api.get<Paginated<TaskListItem>>("/api/risk/tasks", clean(params), signal),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useRiskTask(id: string) {
  return useQuery({ queryKey: riskKeys.task(id), queryFn: ({ signal }) => api.get<TaskDetailDto>(`/api/risk/tasks/${id}`, undefined, signal) });
}

export function useObjectives(params: StrategyListParams, enabled = true) {
  return useQuery({ queryKey: riskKeys.objectives(params), queryFn: ({ signal }) => api.get<Paginated<ObjectiveDto>>("/api/risk/objectives", clean(params), signal), placeholderData: keepPreviousData, enabled });
}

export function useObjective(id: string | null | undefined) {
  return useQuery({ queryKey: riskKeys.objective(id ?? ""), queryFn: ({ signal }) => api.get<ObjectiveDetailDto>(`/api/risk/objectives/${id}`, undefined, signal), enabled: Boolean(id) });
}

export function useTargets(params: StrategyListParams, enabled = true) {
  return useQuery({ queryKey: riskKeys.targets(params), queryFn: ({ signal }) => api.get<Paginated<TargetDto>>("/api/risk/targets", clean(params), signal), placeholderData: keepPreviousData, enabled });
}

export function useTarget(id: string) {
  return useQuery({ queryKey: riskKeys.target(id), queryFn: ({ signal }) => api.get<TargetDetailDto>(`/api/risk/targets/${id}`, undefined, signal) });
}

export function useProgrammes(params: StrategyListParams, enabled = true) {
  return useQuery({ queryKey: riskKeys.programmes(params), queryFn: ({ signal }) => api.get<Paginated<ProgrammeDto>>("/api/risk/programmes", clean(params), signal), placeholderData: keepPreviousData, enabled });
}

export function useProgramme(id: string) {
  return useQuery({ queryKey: riskKeys.programme(id), queryFn: ({ signal }) => api.get<ProgrammeDetailDto>(`/api/risk/programmes/${id}`, undefined, signal) });
}

export function useRiskReport(key: RiskReportKey, params: { from?: string; to?: string; siteId?: string }, enabled = true) {
  return useQuery({ queryKey: riskKeys.report(key, params), queryFn: ({ signal }) => api.get<RiskReportResultDto>(`/api/risk/reports/${key}`, clean(params), signal), enabled, meta: noPersist });
}

export function useRiskMatrix() {
  return useQuery({ queryKey: riskKeys.matrix, queryFn: ({ signal }) => api.get<RiskFormRulesDto[]>("/api/risk/matrix", undefined, signal), meta: noPersist });
}

export function useRiskMatrixForm(id: string | null) {
  return useQuery({ queryKey: riskKeys.matrixForm(id ?? ""), queryFn: ({ signal }) => api.get<FormDetailDto>(`/api/risk/matrix/${id}`, undefined, signal), enabled: Boolean(id), meta: noPersist });
}

export function resolveScan(qr: string) {
  return api.get<ScanResultDto>("/api/risk/scan", { qr });
}

// ── Writes ──────────────────────────────────────────────────────────────────

/** Active hazard / aspect options of the assessment's Risk form; empty = the name is typed. */
export function useHazardOptions(formVersionId: string | null) {
  return useQuery({
    queryKey: riskKeys.hazardOptions(formVersionId ?? ""),
    queryFn: ({ signal }) => api.get<{ options: string[] }>("/api/risk/hazard-options", { formVersionId: formVersionId! }, signal),
    enabled: Boolean(formVersionId),
    staleTime: 60_000,
  });
}

export function useMatrixHazards(formId: string | null) {
  return useQuery({
    queryKey: riskKeys.matrixHazards(formId ?? ""),
    queryFn: ({ signal }) => api.get<HazardOptionDto[]>(`/api/risk/matrix/${formId}/hazards`, undefined, signal),
    enabled: Boolean(formId),
    meta: noPersist,
  });
}

/** Add / rename / switch on-off / remove a hazard option; refreshes the list and the wizard dropdowns. */
export function useHazardOptionCommands(formId: string) {
  const qc = useQueryClient();
  const onSuccess = () => {
    void qc.invalidateQueries({ queryKey: riskKeys.matrixHazards(formId) });
    void qc.invalidateQueries({ queryKey: ["risk", "hazard-options"] });
  };
  return {
    add: useMutation({ mutationFn: (label: string) => api.post<HazardOptionDto>(`/api/risk/matrix/${formId}/hazards`, { label }), onSuccess }),
    update: useMutation({
      mutationFn: ({ id, ...input }: { id: string; label?: string; isActive?: boolean }) => api.put<HazardOptionDto>(`/api/risk/matrix/${formId}/hazards/${id}`, input),
      onSuccess,
    }),
    remove: useMutation({ mutationFn: (id: string) => api.delete<{ ok: true }>(`/api/risk/matrix/${formId}/hazards/${id}`), onSuccess }),
  };
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: riskKeys.all });
}

export function useCreateAssessment() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: (input: AssessmentCreateInput) => api.post<AssessmentWriteResult>("/api/risk/assessments", input), onSuccess: invalidate });
}

export function useUpdateAssessment(id: string) {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: (input: AssessmentUpdateInput) => api.put<AssessmentWriteResult>(`/api/risk/assessments/${id}`, input), onSuccess: invalidate });
}

export type AssessmentCommand =
  | { command: "submit" | "revise" | "archive" | "restore"; expectedVersion: number }
  | { command: "approve"; expectedVersion: number; comment?: string | null }
  | { command: "clone" }
  | ({ command: "review" } & PeriodicReviewInput)
  | { command: "related"; otherId: string };

export function useAssessmentCommand(id: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ command, ...body }: AssessmentCommand) => api.post<AssessmentWriteResult | undefined>(`/api/risk/assessments/${id}/${command}`, body),
    onSuccess: invalidate,
  });
}

export function useUnlinkRelated(id: string) {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: (otherId: string) => api.delete<void>(`/api/risk/assessments/${id}/related/${otherId}`), onSuccess: invalidate });
}

export function useCreateTask() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: (input: TaskCreateInput) => api.post<{ id: string; reference: string }>("/api/risk/tasks", input), onSuccess: invalidate });
}

export function useUpdateTask(id: string) {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: (input: TaskUpdateInput) => api.put<void>(`/api/risk/tasks/${id}`, input), onSuccess: invalidate });
}

export function useStartTask(id: string) {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: (expectedVersion: number) => api.post<void>(`/api/risk/tasks/${id}/start`, { expectedVersion }), onSuccess: invalidate });
}

export function useCompleteTask(id: string) {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: (input: TaskCompleteInput) => api.post<{ rescored: boolean; revision: number | null; score: number | null }>(`/api/risk/tasks/${id}/complete`, input), onSuccess: invalidate });
}

export type StrategyKind = "objectives" | "targets" | "programmes";
export type StrategyPayload = { objectives: ObjectiveInput; targets: TargetInput; programmes: ProgrammeInput };

export function useSaveStrategy<K extends StrategyKind>(kind: K) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, expectedVersion, ...input }: StrategyPayload[K] & { id?: string; expectedVersion?: number }) =>
      id ? api.put<void>(`/api/risk/${kind}/${id}`, { ...input, expectedVersion }).then(() => ({ id })) : api.post<{ id: string }>(`/api/risk/${kind}`, input),
    onSuccess: invalidate,
  });
}
