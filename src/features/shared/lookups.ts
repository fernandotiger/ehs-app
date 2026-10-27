"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { LookupListKey, LookupValueDto, LookupValueInput, LookupValueUpdateInput } from "@/lib/lookups";

export interface LookupItem {
  id: string;
  name: string;
}

/** Company structure (with parent ids) and roles – GET /api/lookups. */
export interface Lookups {
  businessUnits: LookupItem[];
  sites: (LookupItem & { businessUnitId: string })[];
  locations: (LookupItem & { siteId: string; businessUnitId: string })[];
  departments: (LookupItem & { locationId: string; siteId: string; businessUnitId: string })[];
  roles: (LookupItem & { key: string })[];
}

/**
 * Structure items labelled with their parent so same-named nodes are distinguishable
 * ("Operations · Production Floor"). Parents are only shown when a name is ambiguous or the
 * level is commonly repeated (departments, locations).
 */
export function structureOptions(lookups: Lookups | undefined) {
  const byId = <T extends LookupItem>(items: T[] | undefined) => new Map((items ?? []).map((i) => [i.id, i]));
  const bus = byId(lookups?.businessUnits);
  const sites = byId(lookups?.sites);
  const locations = byId(lookups?.locations);
  const label = (name: string, parent: string | undefined) => (parent ? `${name} · ${parent}` : name);
  const multipleBus = (lookups?.businessUnits.length ?? 0) > 1;
  return {
    businessUnits: lookups?.businessUnits ?? [],
    sites: (lookups?.sites ?? []).map((s) => ({ id: s.id, name: label(s.name, multipleBus ? bus.get(s.businessUnitId)?.name : undefined) })),
    locations: (lookups?.locations ?? []).map((l) => ({ id: l.id, name: label(l.name, sites.get(l.siteId)?.name) })),
    departments: (lookups?.departments ?? []).map((d) => ({ id: d.id, name: label(d.name, locations.get(d.locationId)?.name) })),
  };
}

export interface UserOption {
  id: string;
  name: string;
  email: string;
  jobTitle: string | null;
  department: { name: string } | null;
}

export const lookupKeys = {
  all: ["lookups"] as const,
  users: (q: string, permission?: string) => ["lookups", "users", q, permission ?? ""] as const,
  usersByIds: (ids: string[]) => ["lookups", "users", "ids", ...ids] as const,
};

/** Company structure and roles – cached for 10 minutes and persisted for offline forms. */
export function useLookups() {
  return useQuery({
    queryKey: lookupKeys.all,
    queryFn: ({ signal }) => api.get<Lookups>("/api/lookups", undefined, signal),
    staleTime: 10 * 60_000,
  });
}

export function useUserSearch(q: string, options: { permission?: string; enabled?: boolean } = {}) {
  return useQuery({
    queryKey: lookupKeys.users(q, options.permission),
    queryFn: ({ signal }) => api.get<UserOption[]>("/api/lookups/users", { q, permission: options.permission, limit: 20 }, signal),
    enabled: options.enabled ?? true,
    staleTime: 60_000,
    meta: { persist: false },
  });
}

export function useUsersByIds(ids: string[]) {
  return useQuery({
    queryKey: lookupKeys.usersByIds(ids),
    queryFn: ({ signal }) => api.get<UserOption[]>("/api/lookups/users", { ids: ids.join(","), limit: 50 }, signal),
    enabled: ids.length > 0,
    staleTime: 5 * 60_000,
  });
}

// ── Configurable pick-lists (src/lib/lookups.ts catalogue) ──────────────────

export const lookupListKeys = {
  list: (listKey: LookupListKey, includeInactive = false) => ["lookups", "list", listKey, includeInactive] as const,
};

/** Values of a configurable pick-list, e.g. useLookup("general.category"). Active values only by default. */
export function useLookup(listKey: LookupListKey, options: { includeInactive?: boolean } = {}) {
  const includeInactive = Boolean(options.includeInactive);
  return useQuery({
    queryKey: lookupListKeys.list(listKey, includeInactive),
    queryFn: ({ signal }) =>
      api.get<LookupValueDto[]>(`/api/configuration/lookups/${listKey}`, includeInactive ? { includeInactive: "true" } : undefined, signal),
    staleTime: 10 * 60_000,
  });
}

function useInvalidateLookup(listKey: LookupListKey) {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["lookups", "list", listKey] });
}

export function useCreateLookupValue(listKey: LookupListKey) {
  const invalidate = useInvalidateLookup(listKey);
  return useMutation({
    mutationFn: (input: LookupValueInput) => api.post<LookupValueDto>(`/api/configuration/lookups/${listKey}`, input),
    onSuccess: invalidate,
  });
}

export function useUpdateLookupValue(listKey: LookupListKey) {
  const invalidate = useInvalidateLookup(listKey);
  return useMutation({
    mutationFn: ({ id, ...input }: LookupValueUpdateInput & { id: string }) => api.patch<LookupValueDto>(`/api/configuration/lookups/${listKey}/${id}`, input),
    onSuccess: invalidate,
  });
}

export function useReorderLookup(listKey: LookupListKey) {
  const invalidate = useInvalidateLookup(listKey);
  return useMutation({
    mutationFn: (ids: string[]) => api.post<LookupValueDto[]>(`/api/configuration/lookups/${listKey}/reorder`, { ids }),
    onSuccess: invalidate,
  });
}
