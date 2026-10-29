"use client";

import { Ban, CornerDownRight, Lock, Trash2 } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { errorMessage } from "@/lib/api-client";
import { GONE_REASON, matchRoute, NO_ACCESS_REASON } from "@/lib/favourites/rules";
import { useDeleteFavourite, type FavouriteListItem } from "../api";

const TITLES = {
  "no-access": { title: "No access", icon: Lock },
  "needs-previous-step": { title: "Needs an earlier step", icon: CornerDownRight },
  gone: { title: "Page no longer exists", icon: Ban },
} as const;

/** Explains why a favourite can't be opened (no access / needs an earlier step / page gone) and offers Remove. */
export function BlockedFavouriteDialog({ favourite, onClose }: { favourite: FavouriteListItem; onClose: () => void }) {
  const remove = useDeleteFavourite();
  if (favourite.status === "ok") return null;
  const { title, icon: Icon } = TITLES[favourite.status];
  const entry = matchRoute(favourite.url);
  const startHref = favourite.status === "needs-previous-step" ? entry?.previousStep?.startHref : undefined;
  const startTitle = startHref ? (matchRoute(startHref)?.title ?? "the start page") : null;
  const reason = favourite.reason ?? (favourite.status === "no-access" ? NO_ACCESS_REASON : GONE_REASON);

  async function onRemove() {
    try {
      await remove.mutateAsync(favourite.id);
      toast.success(`“${favourite.title}” removed from Favourites`);
      onClose();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon className="size-5 text-warning" aria-hidden /> {title}
          </DialogTitle>
          <DialogDescription>
            <span className="font-medium text-foreground">{favourite.title}</span> – {reason}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:justify-between">
          <Button type="button" variant="outline" onClick={onClose}>
            Close
          </Button>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button type="button" variant={startHref ? "outline" : "destructive"} onClick={() => void onRemove()} disabled={remove.isPending}>
              {remove.isPending ? <Spinner /> : <Trash2 />} {favourite.status === "no-access" ? "Remove from favourites" : "Remove"}
            </Button>
            {startHref && (
              <Button asChild>
                <Link href={startHref} onClick={onClose}>
                  Go to {startTitle}
                </Link>
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
