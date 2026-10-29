"use client";

import { useId, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { errorMessage } from "@/lib/api-client";
import { tileColour, type TileColourName } from "@/lib/favourites/colours";
import { normaliseExternalUrl, URL_MAX_LENGTH, websiteLabel } from "@/lib/favourites/external-url";
import { EXTERNAL_LINK_ICON, isIconName, type IconName } from "@/lib/favourites/icon-names";
import { FAVOURITE_TITLE_MAX, favouriteTitleSchema } from "@/lib/validation/favourites";
import { useCreateFavourite, useUpdateFavourite, type FavouriteListItem } from "../api";
import { ColourPicker } from "./colour-picker";
import { FavouriteTileFace } from "./favourite-tile-face";
import { IconPicker } from "./icon-picker";

/** "Add website link" (or edit one): address, title (from the host name), icon (Globe by default) and colour. No favicon is fetched. */
export function ExternalLinkDialog({ favourite, onClose }: { favourite?: FavouriteListItem; onClose: () => void }) {
  const ids = { url: useId(), title: useId(), colour: useId() };
  const [address, setAddress] = useState(favourite?.url ?? "");
  const [title, setTitle] = useState(favourite?.title ?? "");
  const [titleTouched, setTitleTouched] = useState(Boolean(favourite));
  const [icon, setIcon] = useState<IconName | null>(() => (favourite && isIconName(favourite.icon) ? favourite.icon : null));
  const [colour, setColour] = useState<TileColourName>(() => tileColour(favourite?.color).name);
  const [errors, setErrors] = useState<{ url?: string; title?: string }>({});
  const create = useCreateFavourite();
  const update = useUpdateFavourite();
  const saving = create.isPending || update.isPending;

  const normalised = address.trim() ? normaliseExternalUrl(address) : null;
  const shownTitle = titleTouched ? title : normalised?.ok ? websiteLabel(normalised.url).slice(0, FAVOURITE_TITLE_MAX) : "";

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const next: { url?: string; title?: string } = {};
    const url = normaliseExternalUrl(address);
    if (!url.ok) next.url = url.error;
    const parsedTitle = favouriteTitleSchema.safeParse(shownTitle);
    if (!parsedTitle.success) next.title = parsedTitle.error.issues[0]?.message ?? "Enter a title";
    setErrors(next);
    if (!url.ok || !parsedTitle.success) return;
    if (!navigator.onLine) {
      toast.warning("You're offline. Favourites can be saved when you're back online.");
      return;
    }
    const color = colour === "default" ? null : colour;
    try {
      if (favourite) {
        await update.mutateAsync({ id: favourite.id, url: url.url, title: parsedTitle.data, icon, color });
        toast.success("Website link saved");
      } else {
        await create.mutateAsync({ kind: "EXTERNAL", url: url.url, title: parsedTitle.data, icon, color });
        toast.success("Added to Favourites");
      }
      onClose();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !saving && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{favourite ? "Edit website link" : "Add website link"}</DialogTitle>
          <DialogDescription>A shortcut to a website you use often, like the Health and Safety Authority. It opens in a new tab.</DialogDescription>
        </DialogHeader>
        <form id="external-link-form" noValidate onSubmit={submit}>
          <FieldGroup className="gap-4">
            <Field data-invalid={Boolean(errors.url)}>
              <FieldLabel htmlFor={ids.url}>Website address *</FieldLabel>
              <Input
                id={ids.url}
                inputMode="url"
                autoComplete="url"
                spellCheck={false}
                placeholder="www.hsa.ie"
                maxLength={URL_MAX_LENGTH}
                value={address}
                aria-invalid={Boolean(errors.url)}
                onChange={(e) => {
                  setAddress(e.target.value);
                  setErrors((x) => ({ ...x, url: undefined }));
                }}
              />
              {normalised?.ok && normalised.addedScheme && !errors.url && <FieldDescription>It will be saved as {normalised.url}</FieldDescription>}
              <FieldError errors={errors.url ? [{ message: errors.url }] : []} />
            </Field>
            <Field data-invalid={Boolean(errors.title)}>
              <FieldLabel htmlFor={ids.title}>Title *</FieldLabel>
              <Input
                id={ids.title}
                value={shownTitle}
                maxLength={FAVOURITE_TITLE_MAX}
                placeholder="Filled in from the address"
                aria-invalid={Boolean(errors.title)}
                onChange={(e) => {
                  setTitle(e.target.value);
                  setTitleTouched(true);
                  setErrors((x) => ({ ...x, title: undefined }));
                }}
              />
              <FieldError errors={errors.title ? [{ message: errors.title }] : []} />
            </Field>
            <Field>
              <FieldLabel>Icon</FieldLabel>
              <IconPicker value={icon} defaultIcon={EXTERNAL_LINK_ICON} defaultLabel="Default for website links" onChange={setIcon} />
            </Field>
            <Field>
              <FieldLabel id={ids.colour}>Colour</FieldLabel>
              <ColourPicker value={colour} onChange={setColour} labelId={ids.colour} />
            </Field>
            <Field>
              <FieldLabel>Preview</FieldLabel>
              <FavouriteTileFace
                title={shownTitle.trim() || "Website"}
                icon={icon}
                defaultIcon={EXTERNAL_LINK_ICON}
                color={colour === "default" ? null : colour}
                subtitle={`Website · ${normalised?.ok ? websiteLabel(normalised.url) : "address"}`}
                external
                className="max-w-xs"
              />
            </Field>
          </FieldGroup>
        </form>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="external-link-form" disabled={saving}>
            {saving && <Spinner />} {favourite ? "Save" : "Add link"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
