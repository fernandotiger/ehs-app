"use client";

import { Ban, CornerDownRight, Lock } from "lucide-react";
import { tileColour } from "@/lib/favourites/colours";
import type { IconName } from "@/lib/favourites/icon-names";
import type { FavouriteStatus } from "@/lib/favourites/rules";
import { cn } from "@/lib/utils";
import { FavouriteIcon } from "../icon-map";

const BLOCKED_BADGE: Record<Exclude<FavouriteStatus, "ok">, { label: string; icon: typeof Lock }> = {
  "no-access": { label: "No access", icon: Lock },
  "needs-previous-step": { label: "Needs an earlier step", icon: CornerDownRight },
  gone: { label: "Page no longer exists", icon: Ban },
};

export function blockedLabel(status: FavouriteStatus): string | null {
  return status === "ok" ? null : BLOCKED_BADGE[status].label;
}

/**
 * The look of a favourite tile – used by the Favourites grid and the dialogs' live preview.
 * A large icon in a circle tinted with the chosen colour, a thin accent bar, the title (up to two
 * lines), a muted subtitle and chips. Blocked favourites are greyed with a badge.
 */
export function FavouriteTileFace({
  title,
  icon,
  defaultIcon,
  color,
  subtitle,
  external = false,
  chips = [],
  status = "ok",
  className,
}: {
  title: string;
  icon: string | null;
  defaultIcon: IconName;
  color: string | null;
  subtitle: string;
  external?: boolean;
  chips?: string[];
  status?: FavouriteStatus;
  className?: string;
}) {
  const colour = tileColour(color);
  const blocked = status !== "ok";
  const badge = blocked ? BLOCKED_BADGE[status] : null;
  const BadgeIcon = badge?.icon;

  return (
    <div className={cn("relative flex h-full min-h-32 flex-col gap-3 overflow-hidden rounded-xl border bg-card bg-linear-to-br to-transparent p-4 pt-5", blocked ? "from-muted/60" : colour.tint, className)}>
      <span className={cn("absolute inset-x-0 top-0 h-1", blocked ? "bg-muted-foreground/30" : colour.accent)} aria-hidden />
      <div className={cn("flex items-start gap-3", blocked && "opacity-60")}>
        <span className={cn("flex size-12 shrink-0 items-center justify-center rounded-full", blocked ? "bg-muted text-muted-foreground" : colour.circle)}>
          <FavouriteIcon name={icon} fallback={defaultIcon} className="size-6" />
        </span>
        <div className="min-w-0 flex-1 pr-7">
          <p className="line-clamp-2 leading-snug font-semibold break-words text-foreground">{title || "Untitled"}</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {subtitle}
            {external && <span aria-hidden> ↗</span>}
          </p>
        </div>
      </div>
      {(badge || chips.length > 0) && (
        <div className="mt-auto flex flex-wrap gap-1.5">
          {badge && BadgeIcon && (
            <span className="inline-flex items-center gap-1 rounded-full bg-warning/15 px-2 py-0.5 text-[0.7rem] font-medium text-foreground">
              <BadgeIcon className="size-3" aria-hidden /> {badge.label}
            </span>
          )}
          {chips.map((chip) => (
            <span key={chip} className={cn("rounded-full bg-muted px-2 py-0.5 text-[0.7rem] font-medium text-muted-foreground", blocked && "opacity-60")}>
              {chip}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
