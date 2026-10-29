"use client";

import { ArrowDown, ArrowUp, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { favouriteView } from "@/lib/favourites/view";
import type { FavouriteListItem } from "../api";
import { blockedLabel, FavouriteTileFace } from "./favourite-tile-face";

const tileLink =
  "block h-full rounded-xl outline-none transition duration-150 hover:-translate-y-0.5 hover:shadow-md focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transition-none motion-reduce:hover:translate-y-0";

/** One favourite: the whole tile opens it; the "⋯" menu edits, moves or removes it. Blocked tiles explain themselves. */
export function FavouriteTile({
  favourite,
  isFirst,
  isLast,
  onEdit,
  onMove,
  onRemove,
  onBlocked,
}: {
  favourite: FavouriteListItem;
  isFirst: boolean;
  isLast: boolean;
  onEdit: () => void;
  onMove: (direction: "up" | "down") => void;
  onRemove: () => void;
  onBlocked: () => void;
}) {
  const view = favouriteView(favourite);
  const face = (
    <FavouriteTileFace
      title={favourite.title}
      icon={favourite.icon}
      defaultIcon={view.defaultIcon}
      color={favourite.color}
      subtitle={view.subtitle}
      external={view.external}
      chips={view.chips}
      status={favourite.status}
    />
  );

  return (
    <li className="relative">
      {favourite.status !== "ok" ? (
        <button type="button" onClick={onBlocked} className={`${tileLink} w-full text-left`} aria-label={`${favourite.title} – ${blockedLabel(favourite.status)}. Find out why`}>
          {face}
        </button>
      ) : view.external ? (
        <a href={view.href} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" className={tileLink}>
          {face}
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
      ) : (
        <Link href={view.href} className={tileLink}>
          {face}
        </Link>
      )}
      <div className="absolute top-3 right-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" className="bg-card/70 backdrop-blur" aria-label={`More actions for ${favourite.title}`}>
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={onEdit}>
              <Pencil /> Edit title, icon &amp; colour
            </DropdownMenuItem>
            <DropdownMenuItem disabled={isFirst} onSelect={() => onMove("up")}>
              <ArrowUp /> Move earlier
            </DropdownMenuItem>
            <DropdownMenuItem disabled={isLast} onSelect={() => onMove("down")}>
              <ArrowDown /> Move later
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={onRemove}>
              <Trash2 /> Remove
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </li>
  );
}
