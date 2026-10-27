"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { uploadFile } from "@/lib/upload-client";
import type { CommentDto, EvidenceDto, EvidenceListDto, LinkedRecordsDto } from "@/lib/validation/evidence";

/** Hooks for the shared record services: evidence, comments and linked records. */

export const recordKeys = {
  evidence: (entityType: string, entityId: string) => ["records", "evidence", entityType, entityId] as const,
  comments: (entityType: string, entityId: string) => ["records", "comments", entityType, entityId] as const,
  links: (entityType: string, entityId: string) => ["records", "links", entityType, entityId] as const,
};

// ── Evidence ────────────────────────────────────────────────────────────────

export function useEvidence(entityType: string, entityId: string) {
  return useQuery({
    queryKey: recordKeys.evidence(entityType, entityId),
    queryFn: ({ signal }) => api.get<EvidenceListDto>("/api/evidence", { entityType, entityId }, signal),
  });
}

/** Two-phase upload (purpose "evidence") then attach to the record. */
export function useAddEvidenceFile(entityType: string, entityId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ file, name, onProgress }: { file: File; name?: string; onProgress?: (pct: number) => void }) => {
      const { uploadId } = await uploadFile(file, "evidence", { onProgress });
      return api.post<EvidenceDto>("/api/evidence", { kind: "FILE", entityType, entityId, uploadId, name: name || undefined });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: recordKeys.evidence(entityType, entityId) }),
  });
}

export function useAddEvidenceLink(entityType: string, entityId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; url: string }) => api.post<EvidenceDto>("/api/evidence", { kind: "LINK", entityType, entityId, ...input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: recordKeys.evidence(entityType, entityId) }),
  });
}

export function useRemoveEvidence(entityType: string, entityId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/api/evidence/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: recordKeys.evidence(entityType, entityId) }),
  });
}

// ── Comments ────────────────────────────────────────────────────────────────

export function useComments(entityType: string, entityId: string) {
  return useQuery({
    queryKey: recordKeys.comments(entityType, entityId),
    queryFn: ({ signal }) => api.get<CommentDto[]>("/api/comments", { entityType, entityId }, signal),
  });
}

export function useAddComment(entityType: string, entityId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { body: string; clientId: string }) => api.post<CommentDto>("/api/comments", { entityType, entityId, ...input }),
    onSuccess: (comment) => {
      qc.setQueryData<CommentDto[]>(recordKeys.comments(entityType, entityId), (list) =>
        list ? [...list.filter((c) => c.id !== comment.id), comment] : [comment],
      );
    },
  });
}

// ── Linked records ──────────────────────────────────────────────────────────

export function useLinkedRecords(entityType: string, entityId: string) {
  return useQuery({
    queryKey: recordKeys.links(entityType, entityId),
    queryFn: ({ signal }) => api.get<LinkedRecordsDto>("/api/record-links", { entityType, entityId }, signal),
  });
}
