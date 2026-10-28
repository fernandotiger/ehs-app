"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { LawLinkTarget } from "@/lib/law";
import type { Paginated } from "@/lib/validation/common";
import type {
  LawAcceptInput,
  LawEvaluationInput,
  LawExcludeInput,
  LawLegislationQuery,
  LawLinkCreateInput,
  LawOtherCreateInput,
  LawOtherUpdateInput,
  LawProfileCreateInput,
  LawProfileUpdateInput,
  LawRaiseActionInput,
  LawRaiseIncidentInput,
  LawReportKey,
  LawRequirementListQuery,
  LawTaskCompleteInput,
  LawTaskCreateInput,
  LawTaskListQuery,
  LawTaskUpdateInput,
} from "@/lib/validation/law";
import type { LawConnectionDto, LawFollowUpDto, LawLinkDto, LawLinkOptionDto } from "@/server/modules/law/connections.service";
import type { LawLibraryDto, LawPackagePreviewDto } from "@/server/modules/law/content.service";
import type { NonComplianceReadiness } from "@/server/modules/law/incident-type";
import type {
  LawHistoryEntry,
  LawLegislationDetailDto,
  LawLegislationPage,
  LawOverviewDto,
  LawProfileDetailDto,
  LawProfileListItem,
  LawRequirementDetailDto,
  LawRequirementPage,
  LawTaskDetailDto,
  LawTaskListItem,
  LawTaskSummaryDto,
} from "@/server/modules/law/law.dto";
import type { LawUpdatePreviewDto } from "@/server/modules/law/profile.service";
import type { LawReportDto } from "@/server/modules/law/reports.service";
import type { LawSettingsDto } from "@/server/modules/law/settings.service";

export type * from "@/server/modules/law/law.dto";
export type { LawConnectionDto, LawFollowUpDto, LawLinkDto, LawLinkOptionDto } from "@/server/modules/law/connections.service";
export type { LawLibraryDto, LawPackagePreviewDto } from "@/server/modules/law/content.service";
export type { LawUpdatePreviewDto } from "@/server/modules/law/profile.service";
export type { LawReportDto } from "@/server/modules/law/reports.service";
export type { LawSettingsDto } from "@/server/modules/law/settings.service";
export type { LifecycleStep, RequirementStep } from "@/server/modules/law/workflow";

/** Law module – query keys and React Query hooks. */

export type LawRequirementParams = Partial<Omit<LawRequirementListQuery, "page" | "pageSize">> & { page: number; pageSize: number };
export type LawTaskParams = Partial<Omit<LawTaskListQuery, "page" | "pageSize">> & { page: number; pageSize: number };
export type LawLegislationParams = Partial<Omit<LawLegislationQuery, "page" | "pageSize">> & { page: number; pageSize: number };

export const lawKeys = {
  all: ["law"] as const,
  overview: (profileId: string | null) => ["law", "overview", profileId] as const,
  summary: ["law", "summary"] as const,
  profiles: (archived: boolean) => ["law", "profiles", archived] as const,
  profile: (id: string) => ["law", "profile", id] as const,
  profileUpdate: (id: string) => ["law", "profile", id, "update"] as const,
  requirements: (params: object) => ["law", "requirements", params] as const,
  requirement: (id: string) => ["law", "requirement", id] as const,
  links: (id: string) => ["law", "requirement", id, "links"] as const,
  followUps: (id: string) => ["law", "requirement", id, "follow-ups"] as const,
  linkOptions: (id: string, type: string, q: string) => ["law", "requirement", id, "link-options", type, q] as const,
  history: (kind: string, id: string, page: number) => ["law", "history", kind, id, page] as const,
  tasks: (params: object) => ["law", "tasks", params] as const,
  task: (id: string) => ["law", "task", id] as const,
  legislation: (params: object) => ["law", "legislation", params] as const,
  legislationItem: (id: string, profileId: string | null) => ["law", "legislation", id, profileId] as const,
  library: ["law", "library"] as const,
  settings: ["law", "settings"] as const,
  report: (key: string, params: object) => ["law", "report", key, params] as const,
  connections: (type: string, id: string) => ["law", "connections", type, id] as const,
};

const noPersist = { persist: false } as const;

function clean<T extends object>(params: T): Record<string, string | number | boolean | undefined> {
  return Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== "")) as Record<string, string | number | boolean | undefined>;
}

// ── Reads ───────────────────────────────────────────────────────────────────

export function useLawOverview(profileId: string | null) {
  return useQuery({ queryKey: lawKeys.overview(profileId), queryFn: ({ signal }) => api.get<LawOverviewDto>("/api/law/overview", clean({ profileId }), signal), placeholderData: keepPreviousData });
}

export function useLawSummary(enabled = true) {
  return useQuery({ queryKey: lawKeys.summary, queryFn: ({ signal }) => api.get<LawTaskSummaryDto>("/api/law/summary", undefined, signal), enabled });
}

export function useLawProfiles(archived = false) {
  return useQuery({ queryKey: lawKeys.profiles(archived), queryFn: ({ signal }) => api.get<LawProfileListItem[]>("/api/law/profiles", archived ? { archived: "true" } : undefined, signal) });
}

export function useLawProfile(id: string) {
  return useQuery({ queryKey: lawKeys.profile(id), queryFn: ({ signal }) => api.get<LawProfileDetailDto>(`/api/law/profiles/${id}`, undefined, signal) });
}

export function useLawProfileUpdate(id: string, enabled = true) {
  return useQuery({ queryKey: lawKeys.profileUpdate(id), queryFn: ({ signal }) => api.get<LawUpdatePreviewDto>(`/api/law/profiles/${id}/update`, undefined, signal), enabled, meta: noPersist });
}

export function useLawRequirements(params: LawRequirementParams) {
  return useQuery({ queryKey: lawKeys.requirements(params), queryFn: ({ signal }) => api.get<LawRequirementPage>("/api/law/requirements", clean(params), signal), placeholderData: keepPreviousData });
}

export function useLawRequirement(id: string) {
  return useQuery({ queryKey: lawKeys.requirement(id), queryFn: ({ signal }) => api.get<LawRequirementDetailDto>(`/api/law/requirements/${id}`, undefined, signal) });
}

export function useLawLinks(id: string) {
  return useQuery({ queryKey: lawKeys.links(id), queryFn: ({ signal }) => api.get<LawLinkDto[]>(`/api/law/requirements/${id}/links`, undefined, signal) });
}

export function useLawFollowUps(id: string) {
  return useQuery({ queryKey: lawKeys.followUps(id), queryFn: ({ signal }) => api.get<LawFollowUpDto[]>(`/api/law/requirements/${id}/follow-ups`, undefined, signal) });
}

export function useLawLinkOptions(id: string, targetType: LawLinkTarget, q: string, enabled: boolean) {
  return useQuery({
    queryKey: lawKeys.linkOptions(id, targetType, q),
    queryFn: ({ signal }) => api.get<LawLinkOptionDto[]>(`/api/law/requirements/${id}/link-options`, clean({ targetType, q }), signal),
    enabled,
    placeholderData: keepPreviousData,
    meta: noPersist,
  });
}

export type LawHistoryKind = "profiles" | "requirements" | "tasks";

export function useLawHistory(kind: LawHistoryKind, id: string, page: number) {
  return useQuery({
    queryKey: lawKeys.history(kind, id, page),
    queryFn: ({ signal }) => api.get<Paginated<LawHistoryEntry>>(`/api/law/${kind}/${id}/history`, { page, pageSize: 25 }, signal),
    placeholderData: keepPreviousData,
    meta: noPersist,
  });
}

export function useLawTasks(params: LawTaskParams, enabled = true) {
  return useQuery({ queryKey: lawKeys.tasks(params), queryFn: ({ signal }) => api.get<Paginated<LawTaskListItem>>("/api/law/tasks", clean(params), signal), placeholderData: keepPreviousData, enabled });
}

export function useLawTask(id: string) {
  return useQuery({ queryKey: lawKeys.task(id), queryFn: ({ signal }) => api.get<LawTaskDetailDto>(`/api/law/tasks/${id}`, undefined, signal) });
}

export function useLawLegislation(params: LawLegislationParams) {
  return useQuery({ queryKey: lawKeys.legislation(params), queryFn: ({ signal }) => api.get<LawLegislationPage>("/api/law/legislation", clean(params), signal), placeholderData: keepPreviousData });
}

export function useLawLegislationItem(id: string, profileId: string | null) {
  return useQuery({ queryKey: lawKeys.legislationItem(id, profileId), queryFn: ({ signal }) => api.get<LawLegislationDetailDto>(`/api/law/legislation/${id}`, clean({ profileId }), signal) });
}

/** Installed legal-content versions (+ jurisdictions of the latest one, for new profiles). */
export function useLawLibrary(enabled = true) {
  return useQuery({ queryKey: lawKeys.library, queryFn: ({ signal }) => api.get<LawLibraryDto>("/api/law/content", undefined, signal), enabled });
}

export function useLawSettings() {
  return useQuery({ queryKey: lawKeys.settings, queryFn: ({ signal }) => api.get<LawSettingsDto>("/api/law/settings", undefined, signal), meta: noPersist });
}

export function useLawReport(key: LawReportKey, params: { profileId?: string | null; register?: string; category?: string }) {
  return useQuery({ queryKey: lawKeys.report(key, params), queryFn: ({ signal }) => api.get<LawReportDto>(`/api/law/reports/${key}`, clean(params), signal), placeholderData: keepPreviousData, meta: noPersist });
}

/** Legal requirements linked to / raised from a Risk assessment, Incident or Incident action (back-link card). */
export function useLawConnections(entityType: LawLinkTarget, entityId: string, enabled = true) {
  return useQuery({ queryKey: lawKeys.connections(entityType, entityId), queryFn: ({ signal }) => api.get<LawConnectionDto[]>("/api/law/connections", { entityType, entityId }, signal), enabled });
}

// ── Writes ──────────────────────────────────────────────────────────────────

function useInvalidate() {
  const qc = useQueryClient();
  return () => Promise.all([qc.invalidateQueries({ queryKey: lawKeys.all }), qc.invalidateQueries({ queryKey: ["my-work"] })]);
}

function useWrite<TInput, TResult = void>(fn: (input: TInput) => Promise<TResult>) {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: fn, onSuccess: invalidate });
}

export const useCreateLawProfile = () => useWrite((input: LawProfileCreateInput) => api.post<{ id: string }>("/api/law/profiles", input));
export const useUpdateLawProfile = (id: string) => useWrite((input: LawProfileUpdateInput) => api.put<void>(`/api/law/profiles/${id}`, input));
export const useArchiveLawProfile = (id: string) => useWrite((input: { archived: boolean; expectedVersion: number }) => api.post<void>(`/api/law/profiles/${id}/${input.archived ? "archive" : "restore"}`, { expectedVersion: input.expectedVersion }));
export const useAcceptLawUpdate = (id: string) => useWrite((input: LawAcceptInput) => api.post<{ changed: boolean; flagged: number; added: number }>(`/api/law/profiles/${id}/update`, input));

export const useSaveEvaluation = (id: string) => useWrite((input: LawEvaluationInput) => api.post<{ reviewConfirmed: boolean; complete: boolean }>(`/api/law/requirements/${id}/evaluation`, input));
export const useExcludeRequirement = (id: string) => useWrite((input: LawExcludeInput) => api.post<void>(`/api/law/requirements/${id}/exclude`, input));
export const useIncludeRequirement = (id: string) => useWrite((expectedVersion: number) => api.post<void>(`/api/law/requirements/${id}/include`, { expectedVersion }));
export const useCreateOtherRequirement = () => useWrite((input: LawOtherCreateInput) => api.post<{ id: string; reference: string }>("/api/law/requirements", input));
export const useUpdateOtherRequirement = (id: string) => useWrite((input: LawOtherUpdateInput) => api.put<void>(`/api/law/requirements/${id}`, input));
export const useArchiveOtherRequirement = (id: string) => useWrite((input: { archived: boolean; expectedVersion: number }) => api.post<void>(`/api/law/requirements/${id}/${input.archived ? "archive" : "restore"}`, { expectedVersion: input.expectedVersion }));
export const useLinkRecord = (id: string) => useWrite((input: LawLinkCreateInput) => api.post<{ id: string; created: boolean }>(`/api/law/requirements/${id}/links`, input));
export const useUnlinkRecord = (id: string) => useWrite((linkId: string) => api.delete<void>(`/api/law/requirements/${id}/links/${linkId}`));
export const useRaiseIncident = (id: string) => useWrite((input: LawRaiseIncidentInput) => api.post<{ incidentId: string; reference: string; created: boolean; isDraft: boolean }>(`/api/law/requirements/${id}/incident`, input));
export const useRaiseAction = (id: string) => useWrite((input: LawRaiseActionInput) => api.post<{ actionId: string; reference: string; created: boolean }>(`/api/law/requirements/${id}/action`, input));

export const useCreateLawTask = () => useWrite((input: LawTaskCreateInput) => api.post<{ id: string; reference: string }>("/api/law/tasks", input));
export const useUpdateLawTask = (id: string) => useWrite((input: LawTaskUpdateInput) => api.put<void>(`/api/law/tasks/${id}`, input));
export const useCompleteLawTask = (id: string) => useWrite((input: LawTaskCompleteInput) => api.post<void>(`/api/law/tasks/${id}/complete`, input));
export const useArchiveLawTask = (id: string) => useWrite((input: { archived: boolean; expectedVersion: number }) => api.post<void>(`/api/law/tasks/${id}/${input.archived ? "archive" : "restore"}`, { expectedVersion: input.expectedVersion }));

export const usePreviewLawPackage = () => useMutation({ mutationFn: (pkg: unknown) => api.post<LawPackagePreviewDto>("/api/law/content/preview", { package: pkg }) });
export const useInstallLawPackage = () => useWrite((pkg: unknown) => api.post<{ version: string; changes: number }>("/api/law/content/install", { package: pkg }));
export const useSetUpNonComplianceType = () => useWrite(() => api.post<NonComplianceReadiness>("/api/law/settings/incident-type"));

/** Fetches the sample update package (for preview or download). */
export function fetchSamplePackage(): Promise<unknown> {
  return api.get<unknown>("/api/law/content/sample");
}

