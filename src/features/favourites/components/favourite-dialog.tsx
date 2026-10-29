"use client";

import { Info, RefreshCw } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { errorMessage } from "@/lib/api-client";
import { tileColour, type TileColourName } from "@/lib/favourites/colours";
import { isIconName, type IconName } from "@/lib/favourites/icon-names";
import type { RouteEntry } from "@/lib/favourites/route-registry";
import { defaultFavouriteTitle, describeKept, favouriteChips, matchRoute } from "@/lib/favourites/rules";
import { pageSubtitle, TYPED_DETAILS_CHIP } from "@/lib/favourites/view";
import { FAVOURITE_TITLE_MAX, favouriteTitleSchema } from "@/lib/validation/favourites";
import { useCreateFavourite, useUpdateFavourite, type FavouriteListItem } from "../api";
import { EMPTY_FORM_LINE, TYPED_KEPT_LINE, type CaptureSummary } from "../capture-summary";
import { ColourPicker } from "./colour-picker";
import { FavouriteTileFace } from "./favourite-tile-face";
import { IconPicker } from "./icon-picker";

export interface CurrentPage {
  entry: RouteEntry;
  url: string;
  capture: CaptureSummary;
}

export type FavouriteDialogProps =
  | { mode: "add"; page: CurrentPage; onClose: () => void }
  /** `current` is set when opened from the star: offers "Update to this page now". */
  | { mode: "edit"; favourite: FavouriteListItem; current?: CurrentPage; onClose: () => void };

const OFFLINE = "You're offline. Favourites can be saved when you're back online.";

function savedKeptLine(entry: RouteEntry | null, favourite: FavouriteListItem): string {
  if (!entry) return "This page";
  if (entry.kind === "create") return favourite.hasSnapshot ? TYPED_KEPT_LINE : EMPTY_FORM_LINE;
  return describeKept(entry, favourite.url);
}

/** Add to favourites / Edit title, icon & colour of a page favourite – with a live preview of the tile. */
export function FavouriteDialog(props: FavouriteDialogProps) {
  const ids = { title: useId(), colour: useId() };
  const favourite = props.mode === "edit" ? props.favourite : null;
  const entry = props.mode === "add" ? props.page.entry : matchRoute(props.favourite.url);
  const url = props.mode === "add" ? props.page.url : props.favourite.url;

  const [title, setTitle] = useState(() => (favourite ? favourite.title : entry ? defaultFavouriteTitle(entry, url) : ""));
  const [icon, setIcon] = useState<IconName | null>(() => (favourite && isIconName(favourite.icon) ? favourite.icon : null));
  const [colour, setColour] = useState<TileColourName>(() => tileColour(favourite?.color).name);
  const [error, setError] = useState<string | null>(null);
  const create = useCreateFavourite();
  const update = useUpdateFavourite();
  const saving = create.isPending || update.isPending;

  const defaultIcon = entry?.icon ?? "Star";
  const capture = props.mode === "add" ? props.page.capture : null;
  const hasSnapshot = capture ? Boolean(capture.snapshot) : Boolean(favourite?.hasSnapshot);
  const chips = [...favouriteChips(entry, url), ...(hasSnapshot ? [TYPED_DETAILS_CHIP] : [])];
  const kept = capture ? capture.kept : favourite ? savedKeptLine(entry, favourite) : "";

  function validTitle(): string | null {
    const parsed = favouriteTitleSchema.safeParse(title);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Enter a title");
      return null;
    }
    return parsed.data;
  }

  async function save(withCurrentPage = false) {
    const cleanTitle = validTitle();
    if (!cleanTitle) return;
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      toast.warning(OFFLINE);
      return;
    }
    const color = colour === "default" ? null : colour;
    try {
      if (props.mode === "add") {
        await create.mutateAsync({ kind: "PAGE", url: props.page.url, title: cleanTitle, icon, color, snapshot: props.page.capture.snapshot });
        toast.success("Added to Favourites");
      } else if (withCurrentPage && props.current) {
        await update.mutateAsync({ id: props.favourite.id, title: cleanTitle, icon, color, replaceUrl: props.current.url, snapshot: props.current.capture.snapshot });
        toast.success("Favourite updated to this page");
      } else {
        await update.mutateAsync({ id: props.favourite.id, title: cleanTitle, icon, color });
        toast.success("Favourite saved");
      }
      props.onClose();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !saving && props.onClose()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{props.mode === "add" ? "Add to favourites" : "Edit favourite"}</DialogTitle>
          <DialogDescription>Choose a title, an icon and a colour for its button on your Favourites page.</DialogDescription>
        </DialogHeader>

        <form
          id="favourite-form"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <FieldGroup className="gap-4">
            <Field data-invalid={Boolean(error)}>
              <FieldLabel htmlFor={ids.title}>Title *</FieldLabel>
              <Input
                id={ids.title}
                value={title}
                maxLength={FAVOURITE_TITLE_MAX}
                aria-invalid={Boolean(error)}
                onChange={(e) => {
                  setTitle(e.target.value);
                  setError(null);
                }}
              />
              <FieldError errors={error ? [{ message: error }] : []} />
            </Field>
            <Field>
              <FieldLabel>Icon</FieldLabel>
              <IconPicker value={icon} defaultIcon={defaultIcon} onChange={setIcon} />
            </Field>
            <Field>
              <FieldLabel id={ids.colour}>Colour</FieldLabel>
              <ColourPicker value={colour} onChange={setColour} labelId={ids.colour} />
            </Field>
            <Field>
              <FieldLabel>Preview</FieldLabel>
              <FavouriteTileFace title={title.trim()} icon={icon} defaultIcon={defaultIcon} color={colour === "default" ? null : colour} subtitle={pageSubtitle(entry)} chips={chips} className="max-w-xs" />
            </Field>
            <div className="rounded-lg border bg-muted/40 p-3 text-sm">
              <p className="font-medium">What is kept</p>
              <p className="text-muted-foreground">{kept}</p>
              {capture?.note && (
                <p className="mt-2 flex gap-2 text-muted-foreground">
                  <Info className="mt-0.5 size-4 shrink-0" aria-hidden /> {capture.note}
                </p>
              )}
              <FieldDescription className="mt-1">Only you can see what&apos;s kept.</FieldDescription>
            </div>
            {props.mode === "edit" && props.current && (
              <div className="rounded-lg border border-dashed p-3 text-sm">
                <p className="font-medium">You are on this page now</p>
                <p className="text-muted-foreground">{props.current.capture.kept}</p>
                {props.current.capture.note && <p className="mt-1 text-muted-foreground">{props.current.capture.note}</p>}
                <Button type="button" variant="outline" size="sm" className="mt-2" disabled={saving} onClick={() => void save(true)}>
                  <RefreshCw /> Update to this page now
                </Button>
              </div>
            )}
          </FieldGroup>
        </form>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={props.onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="favourite-form" disabled={saving}>
            {saving && <Spinner />} {props.mode === "add" ? "Add to favourites" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
