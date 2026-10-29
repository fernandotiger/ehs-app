import { z } from "zod";
import { TILE_COLOUR_NAMES } from "@/lib/favourites/colours";
import { normaliseExternalUrl, URL_MAX_LENGTH } from "@/lib/favourites/external-url";
import { ICON_NAMES } from "@/lib/favourites/icon-names";

/** Favourites – schemas shared by the dialogs and the API. */

export const FAVOURITE_LIMIT = 50;
export const FAVOURITE_TITLE_MAX = 60;

export const favouriteTitleSchema = z
  .string()
  .trim()
  .min(1, "Enter a title")
  .max(FAVOURITE_TITLE_MAX, `Keep the title to ${FAVOURITE_TITLE_MAX} characters or fewer`);

/** null / omitted = the page's default icon. */
export const favouriteIconSchema = z.enum(ICON_NAMES, { error: "Choose an icon from the list" }).nullable();

/** null / omitted = Default (company colour). "default" is accepted and stored as null. */
export const favouriteColourSchema = z
  .enum(TILE_COLOUR_NAMES, { error: "Choose a colour from the list" })
  .nullable()
  .transform((v) => (v === "default" ? null : v));

/** An in-app address ("/incidents/register?view=investigations"). The service cleans and re-checks it. */
export const pageUrlSchema = z
  .string()
  .max(URL_MAX_LENGTH, "The page address is too long")
  .refine((v) => v.startsWith("/") && !v.startsWith("//") && !v.startsWith("/\\"), "Only pages of this application can be added here");

/** A website address: http(s) only, no credentials or spaces; "www.hsa.ie" → "https://www.hsa.ie/". */
export const externalUrlSchema = z
  .string()
  .max(URL_MAX_LENGTH + 100, "The address is too long (2 000 characters at most)")
  .transform((value, ctx) => {
    const result = normaliseExternalUrl(value);
    if (!result.ok) {
      ctx.addIssue({ code: "custom", message: result.error });
      return z.NEVER;
    }
    return result.url;
  });

/** Typed values of a create page – sanitised and size-checked by the service. */
export const favouriteSnapshotSchema = z.record(z.string(), z.unknown()).nullable();

export const createFavouriteSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("PAGE"),
    url: pageUrlSchema,
    title: favouriteTitleSchema,
    icon: favouriteIconSchema.optional(),
    color: favouriteColourSchema.optional(),
    snapshot: favouriteSnapshotSchema.optional(),
  }),
  z.object({
    kind: z.literal("EXTERNAL"),
    url: externalUrlSchema,
    title: favouriteTitleSchema,
    icon: favouriteIconSchema.optional(),
    color: favouriteColourSchema.optional(),
  }),
]);
export type CreateFavouriteInput = z.input<typeof createFavouriteSchema>;
export type CreateFavouriteData = z.output<typeof createFavouriteSchema>;

/**
 * Edit title, icon and colour; `url` changes a website link's address; `replaceUrl` (+ `snapshot`)
 * is "Update to this page now" for a page favourite.
 */
export const updateFavouriteSchema = z
  .object({
    title: favouriteTitleSchema.optional(),
    icon: favouriteIconSchema.optional(),
    color: favouriteColourSchema.optional(),
    url: externalUrlSchema.optional(),
    replaceUrl: pageUrlSchema.optional(),
    snapshot: favouriteSnapshotSchema.optional(),
  })
  .refine((v) => !(v.url !== undefined && v.replaceUrl !== undefined), { message: "Change either the website address or the page, not both", path: ["replaceUrl"] })
  .refine((v) => v.snapshot === undefined || v.replaceUrl !== undefined, { message: "Typed details can only be kept with “Update to this page now”", path: ["snapshot"] })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: "Nothing to change" });
export type UpdateFavouriteInput = z.input<typeof updateFavouriteSchema>;
export type UpdateFavouriteData = z.output<typeof updateFavouriteSchema>;

export const moveFavouriteSchema = z.object({ direction: z.enum(["up", "down"]) });
export type MoveFavouriteInput = z.infer<typeof moveFavouriteSchema>;
