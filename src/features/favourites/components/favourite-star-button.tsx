"use client";

import { Info, Star } from "lucide-react";
import dynamic from "next/dynamic";
import { usePathname, useSearchParams } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { useCurrentUser } from "@/components/providers/current-user-provider";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { isOffered } from "@/lib/favourites/route-registry";
import { bookmarkability, cleanPagePath, matchRoute, routeAccess, sameFavourite } from "@/lib/favourites/rules";
import { cn } from "@/lib/utils";
import { useFavourites, type FavouriteListItem } from "../api";
import { emptyCapture, summariseCapture } from "../capture-summary";
import type { CurrentPage } from "./favourite-dialog";

const FavouriteDialog = dynamic(() => import("./favourite-dialog").then((m) => m.FavouriteDialog), { ssr: false });

type StarDialog = { kind: "add"; page: CurrentPage } | { kind: "edit"; favourite: FavouriteListItem; current?: CurrentPage } | { kind: "previous-step" } | null;

const noopSubscribe = () => () => {};
/** False during server rendering and hydration, true afterwards (the filled star depends on cached data). */
function useMounted(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

const findPage = (favourites: FavouriteListItem[] | undefined, url: string) => favourites?.find((f) => f.kind === "PAGE" && sameFavourite(f.url, url));

/**
 * The ☆ in the top bar: shown only on search and create pages the user can open. Filled (★) when the
 * current page – same cleaned address – is already a favourite; clicking it then edits that favourite.
 */
export function FavouriteStarButton() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user } = useCurrentUser();
  const entry = matchRoute(pathname);
  const offered = isOffered(entry) && routeAccess(entry, user);
  const favourites = useFavourites({ enabled: offered });
  const mounted = useMounted();
  const [dialog, setDialog] = useState<StarDialog>(null);

  if (!offered || !entry) return null;

  const search = searchParams.toString();
  const currentUrl = cleanPagePath(search ? `${pathname}?${search}` : pathname);
  const existing = currentUrl ? findPage(favourites.data, currentUrl) : undefined;
  const filled = mounted && Boolean(existing);
  const label = filled ? "In your favourites – edit" : "Add to favourites";

  function openFor(current: CurrentPage) {
    const match = findPage(favourites.data, current.url);
    setDialog(match ? { kind: "edit", favourite: match, current } : { kind: "add", page: current });
  }

  function onClick() {
    if (!entry) return;
    if (!navigator.onLine) {
      toast.warning("You're offline. Favourites can be added when you're back online.");
      return;
    }
    const raw = `${pathname}${window.location.search}`;
    if (bookmarkability(entry, raw) === "needs-previous-step") {
      setDialog({ kind: "previous-step" });
      return;
    }
    const url = cleanPagePath(raw);
    if (!url) {
      toast.error("This page address is too long to keep as a favourite.");
      return;
    }
    openFor({ entry, url, capture: summariseCapture(entry, url) });
  }

  function addPlainAlternative() {
    const plain = entry?.previousStep?.plainAlternative;
    const plainEntry = plain ? matchRoute(plain) : null;
    const url = plain ? cleanPagePath(plain) : null;
    if (!plainEntry || !url) return setDialog(null);
    const match = findPage(favourites.data, url);
    setDialog(match ? { kind: "edit", favourite: match } : { kind: "add", page: { entry: plainEntry, url, capture: emptyCapture(plainEntry, url) } });
  }

  const plainTitle = entry.previousStep?.plainAlternative ? (matchRoute(entry.previousStep.plainAlternative)?.title ?? entry.title) : null;

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" onClick={onClick} aria-label={label} aria-pressed={filled}>
            <Star className={cn("size-4", filled && "fill-amber-400 text-amber-500")} />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>

      {dialog?.kind === "add" && <FavouriteDialog mode="add" page={dialog.page} onClose={() => setDialog(null)} />}
      {dialog?.kind === "edit" && <FavouriteDialog key={dialog.favourite.id} mode="edit" favourite={dialog.favourite} current={dialog.current} onClose={() => setDialog(null)} />}
      {dialog?.kind === "previous-step" && (
        <Dialog open onOpenChange={(open) => !open && setDialog(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Info className="size-5 text-brand" aria-hidden /> This page can&apos;t be a favourite
              </DialogTitle>
              <DialogDescription>{entry.previousStep?.reason ?? "This page needs an earlier step, so it can't be a favourite."}</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialog(null)}>
                Close
              </Button>
              {plainTitle && (
                <Button type="button" onClick={addPlainAlternative}>
                  Add the empty {plainTitle} page instead
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
