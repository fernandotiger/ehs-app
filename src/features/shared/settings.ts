"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { SETTINGS, type SettingKey, type SettingValue } from "@/lib/settings/registry";
import { DEFAULT_SYSTEM_SETTINGS, type SystemSettings } from "@/lib/settings/system";

export const settingsKeys = {
  all: ["settings"] as const,
  one: (key: SettingKey) => ["settings", key] as const,
};

/** @deprecated use settingsKeys.one("system") */
export const settingsKey = settingsKeys.one("system");

/** System settings (upload limits, acknowledgement defaults) – readable by every signed-in user. */
export function useSystemSettings() {
  return useQuery({
    queryKey: settingsKeys.one("system"),
    queryFn: ({ signal }) => api.get<SystemSettings>("/api/configuration/settings", undefined, signal),
    staleTime: 5 * 60_000,
    placeholderData: DEFAULT_SYSTEM_SETTINGS,
  });
}

/** Any registered setting (src/lib/settings/registry.ts), with the registry defaults as placeholder. */
export function useSetting<K extends SettingKey>(key: K) {
  return useQuery({
    queryKey: settingsKeys.one(key),
    queryFn: ({ signal }) => api.get<SettingValue<K>>(`/api/configuration/settings/${key}`, undefined, signal),
    staleTime: 5 * 60_000,
    placeholderData: SETTINGS[key].defaults as SettingValue<K>,
  });
}

export function useSaveSetting<K extends SettingKey>(key: K) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (value: SettingValue<K>) => api.put<SettingValue<K>>(`/api/configuration/settings/${key}`, value),
    onSuccess: (data) => qc.setQueryData(settingsKeys.one(key), data),
  });
}
