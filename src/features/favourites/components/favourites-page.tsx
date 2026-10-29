"use client";

import { Globe, Star } from "lucide-react";
import dynamic from "next/dynamic";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { EmptyState, ErrorState, LoadingCards } from "@/components/common/states";
import { PageBanner } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/api-client";
import { useDeleteFavourite, useFavourites, useMoveFavourite, type FavouriteListItem } from "../api";
import { FavouriteTile } from "./favourite-tile";

// Dialogs (and the icon picker inside them) load when first opened.
const FavouriteDialog = dynamic(() => import("./favourite-dialog").then((m) => m.FavouriteDialog), { ssr: false });
const ExternalLinkDialog = dynamic(() => import("./external-link-dialog").then((m) => m.ExternalLinkDialog), { ssr: false });
const BlockedFavouriteDialog = dynamic(() => import("./blocked-favourite-dialog").then((m) => m.BlockedFavouriteDialog), { ssr: false });

type Open = { kind: "edit"; favourite: FavouriteListItem } | { kind: "add-link" } | { kind: "blocked"; favourite: FavouriteListItem } | { kind: "remove"; favourite: FavouriteListItem } | null;

/** Favourites page: the user's shortcuts as tiles – open one to land exactly where it was kept. */
export function FavouritesPage() {
  const query = useFavourites();
  const move = useMoveFavourite();
  const remove = useDeleteFavourite();
  const [open, setOpen] = useState<Open>(null);
  const favourites = query.data ?? [];
  const close = () => setOpen(null);

  const addLink = (
    <Button variant="secondary" className="bg-white text-brand-dark hover:bg-white/90" onClick={() => setOpen({ kind: "add-link" })}>
      <Globe /> Add website link
    </Button>
  );

  async function onRemove(favourite: FavouriteListItem) {
    try {
      await remove.mutateAsync(favourite.id);
      toast.success(`“${favourite.title}” removed from Favourites`);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  function onMove(favourite: FavouriteListItem, direction: "up" | "down") {
    move.mutate({ id: favourite.id, direction }, { onError: (e) => toast.error(errorMessage(e)) });
  }

  return (
    <>
      <PageBanner title="Favourites" description="Your shortcuts – open one to land exactly where you left it." actions={addLink} />

      {query.isPending ? (
        <LoadingCards count={4} className="lg:grid-cols-3 2xl:grid-cols-4" />
      ) : query.isError && !query.data ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : favourites.length === 0 ? (
        <EmptyState
          icon={Star}
          title="No favourites yet"
          description="Open a search page (like the Incidents register) or a create page (like Report incident) and tap the ☆ star at the top – we keep your filters, tab and what you typed. You can also add a link to a website."
          action={
            <Button onClick={() => setOpen({ kind: "add-link" })}>
              <Globe /> Add website link
            </Button>
          }
        />
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4" aria-label="Your favourites">
          {favourites.map((favourite, index) => (
            <FavouriteTile
              key={favourite.id}
              favourite={favourite}
              isFirst={index === 0}
              isLast={index === favourites.length - 1}
              onEdit={() => setOpen({ kind: "edit", favourite })}
              onMove={(direction) => onMove(favourite, direction)}
              onRemove={() => setOpen({ kind: "remove", favourite })}
              onBlocked={() => setOpen({ kind: "blocked", favourite })}
            />
          ))}
        </ul>
      )}

      {open?.kind === "edit" &&
        (open.favourite.kind === "EXTERNAL" ? (
          <ExternalLinkDialog key={open.favourite.id} favourite={open.favourite} onClose={close} />
        ) : (
          <FavouriteDialog key={open.favourite.id} mode="edit" favourite={open.favourite} onClose={close} />
        ))}
      {open?.kind === "add-link" && <ExternalLinkDialog onClose={close} />}
      {open?.kind === "blocked" && <BlockedFavouriteDialog key={open.favourite.id} favourite={open.favourite} onClose={close} />}
      <ConfirmDialog
        open={open?.kind === "remove"}
        onOpenChange={(value) => !value && close()}
        title="Remove this favourite?"
        description={open?.kind === "remove" ? `“${open.favourite.title}” will be removed from your Favourites. The page itself is not changed.` : undefined}
        confirmLabel="Remove"
        destructive
        onConfirm={async () => {
          if (open?.kind === "remove") await onRemove(open.favourite);
          close();
        }}
      />
    </>
  );
}
