"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { JobRunOutcomeKey, JobRunTriggerKey, ScheduledJobInput } from "@/lib/jobs";
import type { Paginated } from "@/lib/validation/common";
import type { JobDto, JobRunDetailDto, JobRunDto, JobRunItemDto } from "@/server/modules/jobs/job.service";
import type { MyWorkDto, MyWorkItemDto } from "@/server/modules/jobs/my-work.service";
import type { JobTargetOption } from "@/server/modules/jobs/providers";

export type { JobDto, JobRunDetailDto, JobRunDto, JobRunItemDto, JobTargetOption, MyWorkDto, MyWorkItemDto };

/** Scheduled jobs and My work – query keys and hooks. */
export const jobKeys = {
  all: ["jobs"] as const,
  list: (params: object) => ["jobs", "list", params] as const,
  targets: ["jobs", "targets"] as const,
  runs: (params: object) => ["jobs", "runs", params] as const,
  run: (id: string) => ["jobs", "run", id] as const,
  myWork: ["my-work"] as const,
};

const noPersist = { persist: false } as const;

export function useJobs(params: { q?: string; status?: "active" | "paused" | "all" }) {
  return useQuery({
    queryKey: jobKeys.list(params),
    queryFn: ({ signal }) => api.get<JobDto[]>("/api/configuration/jobs", params, signal),
    placeholderData: keepPreviousData,
    meta: noPersist,
  });
}

export function useJobTargets() {
  return useQuery({
    queryKey: jobKeys.targets,
    queryFn: ({ signal }) => api.get<JobTargetOption[]>("/api/configuration/jobs/targets", undefined, signal),
    staleTime: 5 * 60_000,
    meta: noPersist,
  });
}

function useInvalidateJobs() {
  const qc = useQueryClient();
  return () => void qc.invalidateQueries({ queryKey: jobKeys.all });
}

export function useCreateJob() {
  const invalidate = useInvalidateJobs();
  return useMutation({ mutationFn: (input: ScheduledJobInput) => api.post<JobDto>("/api/configuration/jobs", input), onSuccess: invalidate });
}

export function useUpdateJob() {
  const invalidate = useInvalidateJobs();
  return useMutation({
    mutationFn: ({ id, ...input }: ScheduledJobInput & { id: string; expectedVersion: number }) => api.patch<JobDto>(`/api/configuration/jobs/${id}`, input),
    onSuccess: invalidate,
  });
}

export function useSetJobEnabled() {
  const invalidate = useInvalidateJobs();
  return useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) => api.put<JobDto>(`/api/configuration/jobs/${id}/enabled`, { enabled }),
    onSuccess: invalidate,
  });
}

export function useTestJob() {
  const invalidate = useInvalidateJobs();
  return useMutation({ mutationFn: (id: string) => api.post<JobRunDetailDto>(`/api/configuration/jobs/${id}/test`), onSuccess: invalidate });
}

export function useRunJob() {
  const qc = useQueryClient();
  const invalidate = useInvalidateJobs();
  return useMutation({
    mutationFn: (id: string) => api.post<JobRunDetailDto>(`/api/configuration/jobs/${id}/run`),
    onSuccess: () => {
      invalidate();
      void qc.invalidateQueries({ queryKey: ["notifications"] });
      void qc.invalidateQueries({ queryKey: jobKeys.myWork });
    },
  });
}

export interface JobRunsParams {
  page: number;
  pageSize: number;
  jobId?: string;
  outcome?: JobRunOutcomeKey;
  trigger?: JobRunTriggerKey;
}

export function useJobRuns(params: JobRunsParams) {
  return useQuery({
    queryKey: jobKeys.runs(params),
    queryFn: ({ signal }) => api.get<Paginated<JobRunDto>>("/api/configuration/jobs/runs", { ...params }, signal),
    placeholderData: keepPreviousData,
    meta: noPersist,
  });
}

export function useJobRun(id: string | null) {
  return useQuery({
    queryKey: jobKeys.run(id ?? ""),
    queryFn: ({ signal }) => api.get<JobRunDetailDto>(`/api/configuration/jobs/runs/${id}`, undefined, signal),
    enabled: Boolean(id),
    meta: noPersist,
  });
}

/** Everything assigned to me (owner or reviewer), grouped Overdue / Due this week / Later. */
export function useMyWork() {
  return useQuery({
    queryKey: jobKeys.myWork,
    queryFn: ({ signal }) => api.get<MyWorkDto>("/api/my-work", undefined, signal),
    staleTime: 60_000,
  });
}
