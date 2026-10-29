import { updateFavouriteSchema } from "@/lib/validation/favourites";
import { apiHandler } from "@/server/http/api-handler";
import { favouriteService } from "@/server/modules/favourites/favourite.service";

/** GET /api/favourites/:id – one of my favourites with its typed details (owner-only). */
export const GET = apiHandler({}, async ({ user, params }) => favouriteService.get(user, params.id!));

/** PATCH /api/favourites/:id – title, icon, colour; website address; or "Update to this page now". */
export const PATCH = apiHandler({ body: updateFavouriteSchema }, async ({ user, params, body }) => favouriteService.update(user, params.id!, body));

/** DELETE /api/favourites/:id – removes it for good (a favourite is not a business record). */
export const DELETE = apiHandler({}, async ({ user, params }) => {
  await favouriteService.remove(user, params.id!);
});
