"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { deferUrlPatch } from "@/hooks/use-url-state";
import { api, ApiError } from "@/lib/api-client";
import type { SeedKey } from "@/lib/favourites/route-registry";
import { seedForPage } from "@/lib/favourites/seed";
import type { Snapshot } from "@/lib/favourites/snapshot";
import type { CreateFavouriteInput, MoveFavouriteInput, UpdateFavouriteInput } from "@/lib/validation/favourites";
import type { FavouriteDetail, FavouriteListItem } from "@/server/modules/favourites/favourite.dto";

export type * from "@/server/modules/favourites/favourite.dto";

/** Favourites – query keys and React Query hooks. */

export const favouriteKeys = {
  all: ["favourites"] as const,
  list: ["favourites", "list"] as const,
  detail: (id: string) => ["favourites", "detail", id] as const,
};

/**
 * My favourites (no typed details – those only come from the detail query). Refetched whenever a
 * screen using it mounts, so a blocked status (role or modules changed) shows up straight away.
 */
export function useFavourites({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: favouriteKeys.list,
    queryFn: ({ signal }) => api.get<FavouriteListItem[]>("/api/favourites", undefined, signal),
    refetchOnMount: "always",
    enabled,
  });
}

/**
 * One favourite WITH its typed details. Never persisted to the browser cache (`persist: false`) and
 * dropped as soon as nothing uses it (`gcTime: 0`). Phase C's `useFavouriteSeed` builds on this.
 */
export function useFavouriteDetail(id: string | null | undefined) {
  return useQuery({
    queryKey: favouriteKeys.detail(id ?? ""),
    queryFn: ({ signal }) => api.get<FavouriteDetail>(`/api/favourites/${id}`, undefined, signal),
    enabled: Boolean(id),
    gcTime: 0,
    staleTime: 0,
    retry: false,
    meta: { persist: false },
  });
}

// ── Create pages: typed values kept with a favourite ("seed") ──────────────

export type FavouriteSeedStatus = "none" | "loading" | "ready" | "failed";

export interface FavouriteSeed {
  /** none = no `fav` in the address · loading · ready (seed may be null: nothing kept) · failed (form opens empty, a toast explains). */
  status: FavouriteSeedStatus;
  seed: Snapshot | null;
  /** The favourite being restored – use it as the form's `key`. */
  favId: string | null;
}

interface ResolvedSeed {
  favId: string;
  status: "ready" | "failed";
  seed: Snapshot | null;
  message: string | null;
}

const FAV_ID = /^[A-Za-z0-9_-]{1,64}$/;

const SEED_MESSAGES = {
  offline: "You're offline, so what you kept with this favourite can't be filled in. The form starts empty.",
  gone: "This favourite no longer exists, so the form starts empty.",
  otherPage: "This favourite belongs to another page, so the form starts empty.",
  failed: "What you kept with this favourite couldn't be loaded. The form starts empty.",
};

function failedSeed(favId: string, error: unknown): ResolvedSeed {
  const offline = (typeof navigator !== "undefined" && !navigator.onLine) || (error instanceof ApiError && error.isNetworkError);
  const gone = error instanceof ApiError && error.status === 404;
  return { favId, status: "failed", seed: null, message: offline ? SEED_MESSAGES.offline : gone ? SEED_MESSAGES.gone : SEED_MESSAGES.failed };
}

/**
 * A create page opened from a favourite with typed values (`path?fav=<id>`): loads the favourite
 * (never persisted, see `useFavouriteDetail`) and checks that its values are for this page (`key`).
 * Render a loading state while `status` is "loading", then `<Form key={favId ?? "new"} seed={seed} />`
 * – the form merges the seed in its `useState` initialiser, so it is not dirty and nothing races typing.
 * Once settled, `fav` is removed from the address (the result stays latched); offline or on failure the
 * form opens empty and a toast explains.
 */
export function useFavouriteSeed(key: SeedKey, { enabled = true }: { enabled?: boolean } = {}): FavouriteSeed {
  const urlFav = useSearchParams().get("fav");
  // Latched: stripping `fav` from the address must not drop the seed or remount the form.
  const [favId, setFavId] = useState<string | null>(enabled ? urlFav : null);
  if (enabled && urlFav && urlFav !== favId) setFavId(urlFav);
  const valid = favId !== null && FAV_ID.test(favId);
  const detail = useFavouriteDetail(enabled && valid ? favId : null);

  // Settled once per favourite: a later refetch (window focus) – or a failed one – changes nothing.
  const [resolved, setResolved] = useState<ResolvedSeed | null>(null);
  if (enabled && favId && resolved?.favId !== favId) {
    let next: ResolvedSeed | null = null;
    if (!valid) next = { favId, status: "failed", seed: null, message: SEED_MESSAGES.failed };
    else if (detail.isError) next = failedSeed(favId, detail.error);
    else if (detail.fetchStatus === "paused") next = failedSeed(favId, null);
    else if (detail.isSuccess) {
      const check = seedForPage(detail.data, key);
      next = check.ok
        ? { favId, status: "ready", seed: check.seed, message: null }
        : check.reason === "empty"
          ? { favId, status: "ready", seed: null, message: null }
          : { favId, status: "failed", seed: null, message: SEED_MESSAGES.otherPage };
    }
    if (next) setResolved(next);
  }

  const settled = enabled && resolved && resolved.favId === favId ? resolved : null;
  const told = useRef<string | null>(null);
  useEffect(() => {
    if (!settled) return;
    if (settled.message && told.current !== settled.favId) {
      told.current = settled.favId;
      toast.warning(settled.message);
    }
    // The cleanup only cancels a strip that has not run yet (it is idempotent).
    return deferUrlPatch({ fav: null });
  }, [settled]);

  if (!enabled || !favId) return { status: "none", seed: null, favId: null };
  if (!settled) return { status: "loading", seed: null, favId };
  return { status: settled.status, seed: settled.seed, favId };
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: favouriteKeys.all });
}

export function useCreateFavourite() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: (input: CreateFavouriteInput) => api.post<FavouriteListItem>("/api/favourites", input), onSuccess: invalidate });
}

export function useUpdateFavourite() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, ...input }: UpdateFavouriteInput & { id: string }) => api.patch<FavouriteListItem>(`/api/favourites/${id}`, input),
    onSuccess: invalidate,
  });
}

export function useDeleteFavourite() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: (id: string) => api.delete<void>(`/api/favourites/${id}`), onSuccess: invalidate });
}

/** Move earlier / later – the tile moves at once, the server order wins after the refetch. */
export function useMoveFavourite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, direction }: MoveFavouriteInput & { id: string }) => api.post<void>(`/api/favourites/${id}/move`, { direction }),
    onMutate: async ({ id, direction }) => {
      await qc.cancelQueries({ queryKey: favouriteKeys.list });
      const previous = qc.getQueryData<FavouriteListItem[]>(favouriteKeys.list);
      if (previous) {
        const index = previous.findIndex((f) => f.id === id);
        const target = direction === "up" ? index - 1 : index + 1;
        if (index >= 0 && target >= 0 && target < previous.length) {
          const next = [...previous];
          [next[index], next[target]] = [next[target]!, next[index]!];
          qc.setQueryData(favouriteKeys.list, next);
        }
      }
      return { previous };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) qc.setQueryData(favouriteKeys.list, context.previous);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: favouriteKeys.list }),
  });
}
