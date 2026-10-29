"use client";

import { Star } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

/**
 * Shown on a create page that was filled in from a favourite. `sendLabel` names the page's own
 * button(s), e.g. "Submit report or Save draft" (default "Submit").
 */
export function FavouriteSeedBanner({ sendLabel = "Submit", className }: { sendLabel?: string; className?: string }) {
  return (
    <Alert className={cn("mb-4 border-brand/30 bg-brand-soft/60", className)}>
      <Star className="size-4 text-brand" aria-hidden />
      <AlertDescription>
        Filled in from your favourite – a starting point, not a draft. Nothing is sent until you press {sendLabel}. Files are not kept.
      </AlertDescription>
    </Alert>
  );
}
