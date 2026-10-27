"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { lookupKeys } from "@/features/shared/lookups";
import { settingsKeys } from "@/features/shared/settings";
import { api } from "@/lib/api-client";
import type { BrandingColours } from "@/lib/branding";
import type { LookupValueDto, LookupValueInput, LookupValueUpdateInput } from "@/lib/lookups";
import type { SettingKey, SettingValue } from "@/lib/settings/registry";
import type { SystemSettings } from "@/lib/settings/system";
import type { Paginated } from "@/lib/validation/common";
import type {
  AssignmentCreateInput,
  StructureLevel,
  StructureNodeInput,
  UserCreateInput,
  UserUpdateInput,
} from "@/lib/validation/configuration";

/** Configuration module – query keys and React Query hooks for every setup screen. */

export interface AuditRow {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  actorId: string | null;
  actorName: string | null;
  changes: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: string;
}

export interface StructureRow {
  id: string;
  name: string;
  code: string | null;
  notes: string | null;
  isActive: boolean;
  parentId: string | null;
  parentName: string | null;
  path: string | null;
  childCount: number;
  userCount: number;
  updatedAt: string;
}

export interface UserRow {
  id: string;
  name: string;
  email: string;
  jobTitle: string | null;
  isActive: boolean;
  canSignIn: boolean;
  isOwner: boolean;
  department: { id: string; name: string } | null;
  placementLabel: string | null;
  manager: { id: string; name: string } | null;
  roles: string[];
  assignmentCount: number;
  directoryRole: { id: string; name: string } | null;
  createdAt: string;
}

export interface UserDetail extends UserRow {
  departmentId: string | null;
  managerId: string | null;
  assignments: { id: string; role: string; scopeLabel: string; isProtected: boolean }[];
}

export interface RoleRow {
  id: string;
  key: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  isAdministrator: boolean;
  permissions: string[];
  version: number;
  assignmentCount: number;
  directoryUserCount: number;
  updatedAt: string;
}

export interface AssignmentRow {
  id: string;
  user: { id: string; name: string; email: string; isActive: boolean };
  role: { id: string; name: string };
  scopeType: "COMPANY" | "BUSINESS_UNIT" | "SITE" | "LOCATION" | "DEPARTMENT";
  scopeId: string | null;
  scopeLabel: string;
  isProtected: boolean;
  createdAt: string;
}

export interface BrandingSettings {
  name: string;
  colours: BrandingColours;
  logoUrl: string | null;
  version: number;
  logo: { fileName: string; mimeType: string; sizeBytes: number; updatedAt: string } | null;
}

export interface CompanySettings {
  name: string;
  slug: string;
  timeZone: string;
  locale: string;
  plan: string;
  version: number;
}

export interface Subscription {
  plan: string;
  status: string;
  billingConnected: false;
  modules: { key: string; name: string; description: string; enabled: boolean }[];
}

export interface ImportReviewRow {
  line: number;
  type: string;
  key: string;
  name: string;
  parentKey: string;
  email: string;
  permissions: string[];
  notes: string;
  parentLabel: string | null;
}

export interface ImportReview {
  rows: ImportReviewRow[];
  issues: { line: number; message: string }[];
  counts: Record<string, number>;
  valid: boolean;
}

export interface ImportResult {
  created: Record<string, number>;
  total: number;
}

export interface Insights {
  directory: { active: number; inactive: number; canSignIn: number; directoryOnly: number; withRole: number; withoutRole: number };
  usersByRole: { roleId: string; name: string; users: number }[];
  structure: { businessUnits: number; sites: number; locations: number; departments: number };
  modules: { module: string; label: string; hint: string; href: string; count: number }[];
}

export type CategoryListValue = LookupValueDto & { documentCount: number };

const noPersist = { persist: false } as const;

export const configurationKeys = {
  all: ["configuration"] as const,
  audit: (params: object) => ["configuration", "audit-log", params] as const,
  structure: (level: StructureLevel, params: object) => ["configuration", "structure", level, params] as const,
  structureAll: ["configuration", "structure"] as const,
  structureCounts: ["configuration", "structure", "counts"] as const,
  users: (params: object) => ["configuration", "users", "list", params] as const,
  usersAll: ["configuration", "users"] as const,
  user: (id: string) => ["configuration", "users", "detail", id] as const,
  roles: ["configuration", "roles"] as const,
  assignments: (params: object) => ["configuration", "assignments", params] as const,
  assignmentsAll: ["configuration", "assignments"] as const,
  versionedSetting: (key: SettingKey) => ["configuration", "setting", key] as const,
  company: ["configuration", "company"] as const,
  branding: ["configuration", "branding"] as const,
  subscription: ["configuration", "subscription"] as const,
  categories: ["configuration", "document-categories"] as const,
  insights: ["insights"] as const,
};

// ── System settings & audit log ─────────────────────────────────────────────

export function useSaveSystemSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: SystemSettings) => api.put<SystemSettings>("/api/configuration/settings", data),
    onSuccess: (data) => qc.setQueryData(settingsKeys.one("system"), data),
  });
}

export function useAuditLog(params: { page: number; pageSize: number; q?: string; entityType?: string }) {
  return useQuery({
    queryKey: configurationKeys.audit(params),
    queryFn: ({ signal }) => api.get<Paginated<AuditRow>>("/api/configuration/audit-log", { ...params }, signal),
    placeholderData: keepPreviousData,
    meta: noPersist,
  });
}

/** A setting with its version, for forms that must not overwrite someone else's save. */
export function useVersionedSetting<K extends SettingKey>(key: K) {
  return useQuery({
    queryKey: configurationKeys.versionedSetting(key),
    queryFn: ({ signal }) => api.get<{ value: SettingValue<K>; version: number }>(`/api/configuration/settings/${key}/versioned`, undefined, signal),
    staleTime: 0,
    meta: noPersist,
  });
}

export function useSaveVersionedSetting<K extends SettingKey>(key: K) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { value: SettingValue<K>; expectedVersion: number }) =>
      api.put<{ value: SettingValue<K>; version: number }>(`/api/configuration/settings/${key}/versioned`, input),
    onSuccess: (data) => {
      qc.setQueryData(configurationKeys.versionedSetting(key), data);
      qc.setQueryData(settingsKeys.one(key), data.value);
    },
  });
}

export function useCompanySettings() {
  return useQuery({
    queryKey: configurationKeys.company,
    queryFn: ({ signal }) => api.get<CompanySettings>("/api/configuration/company", undefined, signal),
    staleTime: 0,
    meta: noPersist,
  });
}

export function useSaveCompanySettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { timeZone: string; locale: string; expectedVersion: number }) => api.put<CompanySettings>("/api/configuration/company", input),
    onSuccess: (data) => qc.setQueryData(configurationKeys.company, data),
  });
}

// ── Company structure ───────────────────────────────────────────────────────

export interface StructureListParams {
  page: number;
  pageSize: number;
  q?: string;
  status: "active" | "inactive" | "all";
  parentId?: string;
}

export function useStructureList(level: StructureLevel, params: StructureListParams) {
  return useQuery({
    queryKey: configurationKeys.structure(level, params),
    queryFn: ({ signal }) => api.get<Paginated<StructureRow>>(`/api/configuration/structure/${level}`, { ...params }, signal),
    placeholderData: keepPreviousData,
    meta: noPersist,
  });
}

export function useStructureCounts() {
  return useQuery({
    queryKey: configurationKeys.structureCounts,
    queryFn: ({ signal }) => api.get<Record<StructureLevel, number>>("/api/configuration/structure/counts", undefined, signal),
    meta: noPersist,
  });
}

function useInvalidateStructure() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: configurationKeys.structureAll });
    // Pickers everywhere use GET /api/lookups.
    void qc.invalidateQueries({ queryKey: lookupKeys.all, exact: true });
  };
}

export function useSaveStructureNode(level: StructureLevel) {
  const invalidate = useInvalidateStructure();
  return useMutation({
    mutationFn: ({ id, ...input }: StructureNodeInput & { id?: string }): Promise<{ id: string; repositioned?: Record<string, number> | null }> =>
      id ? api.patch(`/api/configuration/structure/${level}/${id}`, input) : api.post(`/api/configuration/structure/${level}`, input),
    onSuccess: invalidate,
  });
}

export function useSetStructureActive(level: StructureLevel) {
  const invalidate = useInvalidateStructure();
  return useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => api.put(`/api/configuration/structure/${level}/${id}/active`, { isActive }),
    onSuccess: invalidate,
  });
}

// ── Users ───────────────────────────────────────────────────────────────────

export interface UserListParams {
  page: number;
  pageSize: number;
  q?: string;
  departmentId?: string;
  roleId?: string;
  status: "active" | "inactive" | "all";
}

export function useUserDirectory(params: UserListParams) {
  return useQuery({
    queryKey: configurationKeys.users(params),
    queryFn: ({ signal }) => api.get<Paginated<UserRow>>("/api/configuration/users", { ...params }, signal),
    placeholderData: keepPreviousData,
    meta: noPersist,
  });
}

export function useUserDetail(id: string | null) {
  return useQuery({
    queryKey: configurationKeys.user(id ?? ""),
    queryFn: ({ signal }) => api.get<UserDetail>(`/api/configuration/users/${id}`, undefined, signal),
    enabled: Boolean(id),
    meta: noPersist,
  });
}

function useInvalidateUsers() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: configurationKeys.usersAll });
    void qc.invalidateQueries({ queryKey: configurationKeys.assignmentsAll });
    void qc.invalidateQueries({ queryKey: configurationKeys.roles });
    void qc.invalidateQueries({ queryKey: ["lookups", "users"] });
  };
}

export function useCreateUser() {
  const invalidate = useInvalidateUsers();
  return useMutation({
    mutationFn: (input: UserCreateInput) => api.post<{ id: string; canSignIn: boolean; invitationSent: false }>("/api/configuration/users", input),
    onSuccess: invalidate,
  });
}

export function useUpdateUser() {
  const invalidate = useInvalidateUsers();
  return useMutation({
    mutationFn: ({ id, ...input }: UserUpdateInput & { id: string }) => api.patch<UserDetail>(`/api/configuration/users/${id}`, input),
    onSuccess: invalidate,
  });
}

export function useSetUserActive() {
  const invalidate = useInvalidateUsers();
  return useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api.put<{ id: string; isActive: boolean; sessionsRevoked: number }>(`/api/configuration/users/${id}/active`, { isActive }),
    onSuccess: invalidate,
  });
}

export function useSetUserPassword() {
  const invalidate = useInvalidateUsers();
  return useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) => api.put(`/api/configuration/users/${id}/password`, { password }),
    onSuccess: invalidate,
  });
}

// ── Roles & assignments ─────────────────────────────────────────────────────

export function useRoles() {
  return useQuery({
    queryKey: configurationKeys.roles,
    queryFn: ({ signal }) => api.get<RoleRow[]>("/api/configuration/roles", undefined, signal),
    meta: noPersist,
  });
}

function useInvalidateRoles() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: configurationKeys.roles });
    void qc.invalidateQueries({ queryKey: lookupKeys.all, exact: true });
  };
}

export function useCreateRole() {
  const invalidate = useInvalidateRoles();
  return useMutation({
    mutationFn: (input: { name: string; description?: string | null }) => api.post<RoleRow>("/api/configuration/roles", input),
    onSuccess: invalidate,
  });
}

export function useUpdateRole() {
  const qc = useQueryClient();
  const invalidate = useInvalidateRoles();
  return useMutation({
    mutationFn: ({ id, ...input }: { id: string; name?: string; description?: string | null; permissions?: string[]; expectedVersion: number }) =>
      api.patch<RoleRow>(`/api/configuration/roles/${id}`, input),
    onSuccess: (role) => {
      qc.setQueryData<RoleRow[]>(configurationKeys.roles, (list) => list?.map((r) => (r.id === role.id ? role : r)));
      invalidate();
    },
  });
}

export function useDeleteRole() {
  const invalidate = useInvalidateRoles();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/api/configuration/roles/${id}`),
    onSuccess: invalidate,
  });
}

export interface AssignmentListParams {
  page: number;
  pageSize: number;
  q?: string;
  roleId?: string;
  scopeType?: AssignmentRow["scopeType"];
}

export function useAssignments(params: AssignmentListParams) {
  return useQuery({
    queryKey: configurationKeys.assignments(params),
    queryFn: ({ signal }) => api.get<Paginated<AssignmentRow>>("/api/configuration/assignments", { ...params }, signal),
    placeholderData: keepPreviousData,
    meta: noPersist,
  });
}

function useInvalidateAssignments() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: configurationKeys.assignmentsAll });
    void qc.invalidateQueries({ queryKey: configurationKeys.roles });
    void qc.invalidateQueries({ queryKey: configurationKeys.usersAll });
  };
}

export function useCreateAssignment() {
  const invalidate = useInvalidateAssignments();
  return useMutation({
    mutationFn: (input: AssignmentCreateInput) => api.post<{ id: string; scopeLabel: string }>("/api/configuration/assignments", input),
    onSuccess: invalidate,
  });
}

export function useRemoveAssignment() {
  const invalidate = useInvalidateAssignments();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/api/configuration/assignments/${id}`),
    onSuccess: invalidate,
  });
}

// ── Lists: document categories (lookup lists use features/shared/lookups) ──

export function useCategoryList(enabled = true) {
  return useQuery({
    queryKey: configurationKeys.categories,
    queryFn: ({ signal }) => api.get<CategoryListValue[]>("/api/configuration/document-categories", undefined, signal),
    enabled,
    meta: noPersist,
  });
}

function useInvalidateCategories() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: configurationKeys.categories });
    void qc.invalidateQueries({ queryKey: ["documents", "categories"] });
  };
}

export function useCreateCategory() {
  const invalidate = useInvalidateCategories();
  return useMutation({ mutationFn: (input: LookupValueInput) => api.post<CategoryListValue>("/api/configuration/document-categories", input), onSuccess: invalidate });
}

export function useUpdateCategory() {
  const invalidate = useInvalidateCategories();
  return useMutation({
    mutationFn: ({ id, ...input }: LookupValueUpdateInput & { id: string }) => api.patch<CategoryListValue>(`/api/configuration/document-categories/${id}`, input),
    onSuccess: invalidate,
  });
}

export function useReorderCategories() {
  const invalidate = useInvalidateCategories();
  return useMutation({ mutationFn: (ids: string[]) => api.post<CategoryListValue[]>("/api/configuration/document-categories/reorder", { ids }), onSuccess: invalidate });
}

// ── Branding ────────────────────────────────────────────────────────────────

export function useBrandingSettings() {
  return useQuery({
    queryKey: configurationKeys.branding,
    queryFn: ({ signal }) => api.get<BrandingSettings>("/api/configuration/branding", undefined, signal),
    staleTime: 0,
    meta: noPersist,
  });
}

export function useSaveBranding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; primary: string; secondary: string; tertiary: string; expectedVersion: number }) =>
      api.put<BrandingSettings>("/api/configuration/branding", input),
    onSuccess: (data) => qc.setQueryData(configurationKeys.branding, data),
  });
}

export function useSetLogo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (uploadId: string) => api.post<BrandingSettings>("/api/configuration/branding/logo", { uploadId }),
    onSuccess: (data) => qc.setQueryData(configurationKeys.branding, data),
  });
}

export function useRemoveLogo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.delete<BrandingSettings>("/api/configuration/branding/logo"),
    onSuccess: (data) => qc.setQueryData(configurationKeys.branding, data),
  });
}

// ── Bulk import, subscription, insights ─────────────────────────────────────

export function useReviewImport() {
  return useMutation({ mutationFn: (input: { content: string; fileName?: string }) => api.post<ImportReview>("/api/configuration/import/review", input) });
}

export function useApplyImport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { content: string; fileName?: string }) => api.post<ImportResult>("/api/configuration/import/apply", input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: configurationKeys.all });
      void qc.invalidateQueries({ queryKey: ["lookups"] });
      void qc.invalidateQueries({ queryKey: configurationKeys.insights });
    },
  });
}

export function useSubscription() {
  return useQuery({
    queryKey: configurationKeys.subscription,
    queryFn: ({ signal }) => api.get<Subscription>("/api/configuration/subscription", undefined, signal),
    meta: noPersist,
  });
}

export function useInsights(enabled = true) {
  return useQuery({
    queryKey: configurationKeys.insights,
    queryFn: ({ signal }) => api.get<Insights>("/api/insights", undefined, signal),
    enabled,
    staleTime: 60_000,
  });
}
