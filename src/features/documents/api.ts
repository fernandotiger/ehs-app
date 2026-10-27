"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { useCurrentUser } from "@/components/providers/current-user-provider";
import { api, ApiError } from "@/lib/api-client";
import { enqueue, useOutbox } from "@/lib/offline/outbox";
import type { Paginated } from "@/lib/validation/common";
import { audienceSize, EMPTY_AUDIENCE } from "@/lib/validation/documents";
import type {
  AckReportStatus,
  AudienceInput,
  CreateDocumentInput,
  CreateSurveyDocumentInput,
  LibraryStatusFilter,
  LibraryTypeFilter,
  MyDocumentFilter,
  NewVersionInput,
  UpdateDocumentInput,
} from "@/lib/validation/documents";
import type {
  AckReportRow,
  CategoryDto,
  ComplianceStats,
  ComplianceSummaryResponse,
  CreatedDocumentDto,
  DocumentAuditEntry,
  DocumentViewerDto,
  LibraryItem,
  ManageDocumentDto,
  MyDocumentsResponse,
  VersionHistoryItem,
} from "@/server/modules/documents/document.dto";

export type {
  AckReportRow,
  AudienceSummaryDto,
  CategoryDto,
  ComplianceStats,
  ComplianceSummaryItem,
  DocumentAuditEntry,
  DocumentViewerDto,
  LibraryItem,
  ManageDocumentDto,
  MyAckStatus,
  MyDocumentItem,
  VersionHistoryItem,
} from "@/server/modules/documents/document.dto";

// ── Query keys ──────────────────────────────────────────────────────────────

export interface MyDocumentsParams {
  page: number;
  pageSize: number;
  q?: string;
  categoryId?: string;
  filter: MyDocumentFilter;
}

export interface LibraryParams {
  page: number;
  pageSize: number;
  q?: string;
  categoryId?: string;
  status: LibraryStatusFilter;
  type?: LibraryTypeFilter;
  createdBy?: "me";
}

export interface AckReportParams {
  page: number;
  pageSize: number;
  status: AckReportStatus;
  q?: string;
  departmentId?: string;
  locationId?: string;
}

export const documentKeys = {
  all: ["documents"] as const,
  my: (params: MyDocumentsParams) => ["documents", "my", params] as const,
  detail: (id: string) => ["documents", "detail", id] as const,
  categories: ["documents", "categories"] as const,
  library: (params: LibraryParams) => ["documents", "library", params] as const,
  manage: (id: string) => ["documents", "manage", id] as const,
  versions: (id: string) => ["documents", "versions", id] as const,
  compliance: (id: string) => ["documents", "compliance", id] as const,
  report: (id: string, params: AckReportParams) => ["documents", "report", id, params] as const,
  audit: (id: string, params: object) => ["documents", "audit", id, params] as const,
  summary: (limit: number) => ["documents", "summary", limit] as const,
  estimate: (audience: AudienceInput) => ["documents", "estimate", audience] as const,
};

/** Authorised file URL. `download` forces an attachment; otherwise inline preview where safe. */
export function documentFileUrl(documentId: string, versionId: string, download = false): string {
  return `/api/documents/${documentId}/versions/${versionId}/file${download ? "?download=1" : ""}`;
}

export function acknowledgementExportUrl(documentId: string, params: { status: "acknowledged" | "outstanding"; departmentId?: string; locationId?: string }): string {
  const qs = new URLSearchParams({ status: params.status });
  if (params.departmentId) qs.set("departmentId", params.departmentId);
  if (params.locationId) qs.set("locationId", params.locationId);
  return `/api/documents/${documentId}/acknowledgements/export?${qs.toString()}`;
}

// ── Employee ────────────────────────────────────────────────────────────────

/** My Documents – persisted for offline reading. */
export function useMyDocuments(params: MyDocumentsParams) {
  return useQuery({
    queryKey: documentKeys.my(params),
    queryFn: ({ signal }) => api.get<MyDocumentsResponse>("/api/documents/my", { ...params }, signal),
    placeholderData: keepPreviousData,
  });
}

/** Viewer detail – persisted for offline reading. */
export function useDocument(id: string) {
  return useQuery({
    queryKey: documentKeys.detail(id),
    queryFn: ({ signal }) => api.get<DocumentViewerDto>(`/api/documents/${id}`, undefined, signal),
  });
}

export function useDocumentCategories() {
  return useQuery({
    queryKey: documentKeys.categories,
    queryFn: ({ signal }) => api.get<CategoryDto[]>("/api/documents/categories", undefined, signal),
    staleTime: 5 * 60_000,
  });
}

/** Document ids with an acknowledgement waiting in the offline outbox. */
export function usePendingAcknowledgements(): Set<string> {
  const { user } = useCurrentUser();
  const ops = useOutbox(user.id, "document.acknowledge");
  return useMemo(() => new Set(ops.map((o) => String(o.payload.documentId))), [ops]);
}

export type AcknowledgeOutcome = { queued: true } | { queued: false; acknowledgedAt: string; versionNumber: number };

/**
 * Acknowledge the current version. Offline (or when the request cannot reach the server)
 * the acknowledgement is queued in the outbox as `document.acknowledge` and replayed on Sync.
 */
export function useAcknowledgeDocument(document: Pick<DocumentViewerDto, "id" | "title">) {
  const qc = useQueryClient();
  const { user } = useCurrentUser();

  const queue = async (versionId: string): Promise<AcknowledgeOutcome> => {
    await enqueue({
      type: "document.acknowledge",
      payload: { documentId: document.id, versionId, clientAcknowledgedAt: new Date().toISOString() },
      label: `Acknowledge ${document.title}`,
      userId: user.id,
    });
    return { queued: true };
  };

  return useMutation({
    mutationFn: async (versionId: string): Promise<AcknowledgeOutcome> => {
      if (typeof navigator !== "undefined" && !navigator.onLine) return queue(versionId);
      try {
        const res = await api.post<{ acknowledgedAt: string; versionNumber: number }>(`/api/documents/${document.id}/acknowledge`, { versionId });
        return { queued: false, acknowledgedAt: res.acknowledgedAt, versionNumber: res.versionNumber };
      } catch (error) {
        if (error instanceof ApiError && error.isNetworkError) return queue(versionId);
        throw error;
      }
    },
    onSuccess: (outcome) => {
      if (!outcome.queued) void qc.invalidateQueries({ queryKey: documentKeys.all });
    },
  });
}

// ── Library & management ────────────────────────────────────────────────────

export function useDocumentLibrary(params: LibraryParams) {
  return useQuery({
    queryKey: documentKeys.library(params),
    queryFn: ({ signal }) => api.get<Paginated<LibraryItem>>("/api/documents", { ...params }, signal),
    placeholderData: keepPreviousData,
  });
}

export function useManageDocument(id: string) {
  return useQuery({
    queryKey: documentKeys.manage(id),
    queryFn: ({ signal }) => api.get<ManageDocumentDto>(`/api/documents/${id}/manage`, undefined, signal),
  });
}

export function useDocumentVersions(id: string) {
  return useQuery({
    queryKey: documentKeys.versions(id),
    queryFn: ({ signal }) => api.get<VersionHistoryItem[]>(`/api/documents/${id}/versions`, undefined, signal),
  });
}

export function useDocumentCompliance(id: string, enabled = true) {
  return useQuery({
    queryKey: documentKeys.compliance(id),
    queryFn: ({ signal }) => api.get<ComplianceStats>(`/api/documents/${id}/compliance`, undefined, signal),
    enabled,
  });
}

export function useAcknowledgementReport(id: string, params: AckReportParams) {
  return useQuery({
    queryKey: documentKeys.report(id, params),
    queryFn: ({ signal }) => api.get<Paginated<AckReportRow>>(`/api/documents/${id}/acknowledgements`, { ...params }, signal),
    placeholderData: keepPreviousData,
    meta: { persist: false },
  });
}

export function useDocumentAudit(id: string, params: { page: number; pageSize: number; kind: "changes" | "all" }) {
  return useQuery({
    queryKey: documentKeys.audit(id, params),
    queryFn: ({ signal }) => api.get<Paginated<DocumentAuditEntry>>(`/api/documents/${id}/audit`, { ...params }, signal),
    placeholderData: keepPreviousData,
    meta: { persist: false },
  });
}

export function useComplianceSummary(limit: number, enabled = true) {
  return useQuery({
    queryKey: documentKeys.summary(limit),
    queryFn: ({ signal }) => api.get<ComplianceSummaryResponse>("/api/documents/compliance", { limit }, signal),
    enabled,
  });
}

function hasAudience(a: AudienceInput) {
  return a.allEmployees || audienceSize({ ...EMPTY_AUDIENCE, ...a }) > 0;
}

/** "≈ N people" for the audience builder. */
export function useAudienceEstimate(audience: AudienceInput) {
  return useQuery({
    queryKey: documentKeys.estimate(audience),
    queryFn: () => api.post<{ count: number }>("/api/documents/audience-estimate", { audience }),
    enabled: hasAudience(audience),
    staleTime: 60_000,
    placeholderData: keepPreviousData,
    meta: { persist: false },
  });
}

function useInvalidateDocuments() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: documentKeys.all });
}

export function useCreateDocument() {
  const invalidate = useInvalidateDocuments();
  return useMutation({
    mutationFn: (data: CreateDocumentInput) => api.post<CreatedDocumentDto>("/api/documents", data),
    onSuccess: () => void invalidate(),
  });
}

/** Survey page: survey + file + audiences + acknowledgement, without document details. */
export function useCreateSurveyDocument() {
  const invalidate = useInvalidateDocuments();
  return useMutation({
    mutationFn: (data: CreateSurveyDocumentInput) => api.post<CreatedDocumentDto>("/api/documents/surveys", data),
    onSuccess: () => void invalidate(),
  });
}

export function useUpdateDocument(id: string) {
  const invalidate = useInvalidateDocuments();
  return useMutation({
    mutationFn: (data: UpdateDocumentInput) => api.put<{ id: string; notified: number }>(`/api/documents/${id}`, data),
    onSuccess: () => void invalidate(),
  });
}

export type DocumentAction = "publish" | "archive" | "restore";

export function useDocumentAction(id: string) {
  const invalidate = useInvalidateDocuments();
  return useMutation({
    mutationFn: (action: DocumentAction) => api.post<{ id: string; notified?: number }>(`/api/documents/${id}/${action}`),
    onSuccess: () => void invalidate(),
  });
}

export function useAddVersion(id: string) {
  const invalidate = useInvalidateDocuments();
  return useMutation({
    mutationFn: (data: NewVersionInput) =>
      api.post<{ id: string; versionNumber: number; requiresReacknowledgement: boolean; notified: number }>(`/api/documents/${id}/versions`, data),
    onSuccess: () => void invalidate(),
  });
}
