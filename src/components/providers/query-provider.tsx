"use client";

import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { QueryClient, QueryClientProvider, onlineManager } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { del, get, set } from "idb-keyval";
import { useState } from "react";
import { ApiError } from "@/lib/api-client";

/** Bump to invalidate every persisted cache after incompatible API changes. */
const CACHE_BUSTER = "v1";
const MAX_AGE = 1000 * 60 * 60 * 24 * 7; // keep offline data for a week

const persister =
  typeof window !== "undefined"
    ? createAsyncStoragePersister({
        key: "ehs-query-cache",
        storage: { getItem: (k) => get(k), setItem: (k, v) => set(k, v), removeItem: (k) => del(k) },
        throttleTime: 2000,
      })
    : undefined;

/**
 * React Query with its cache persisted to IndexedDB, so data the user has already seen
 * (My Documents, My work, reference lists) remains available while offline.
 */
export function QueryProvider({ children, userId }: { children: React.ReactNode; userId: string | null }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            gcTime: MAX_AGE,
            networkMode: "offlineFirst",
            refetchOnWindowFocus: true,
            retry: (count, error) => {
              if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
              return count < 2;
            },
          },
          mutations: { networkMode: "always" },
        },
      }),
  );

  if (!persister) return <QueryClientProvider client={client}>{children}</QueryClientProvider>;

  return (
    <PersistQueryClientProvider
      client={client}
      persistOptions={{
        persister,
        maxAge: MAX_AGE,
        // Scope the persisted cache to the signed-in user.
        buster: `${CACHE_BUSTER}:${userId ?? "anon"}`,
        dehydrateOptions: {
          shouldDehydrateQuery: (q) => q.state.status === "success" && q.meta?.persist !== false,
        },
      }}
      onSuccess={() => {
        if (onlineManager.isOnline()) void client.invalidateQueries();
      }}
    >
      {children}
    </PersistQueryClientProvider>
  );
}
