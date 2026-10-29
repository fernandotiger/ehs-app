import { createFavouriteSchema } from "@/lib/validation/favourites";
import { apiHandler } from "@/server/http/api-handler";
import { favouriteService } from "@/server/modules/favourites/favourite.service";

/** GET /api/favourites – my favourites with status (never the typed details). Any signed-in user. */
export const GET = apiHandler({}, async ({ user }) => favouriteService.list(user));

/** POST /api/favourites – add a page (re-checked against the registry and my access) or a website link. */
export const POST = apiHandler({ body: createFavouriteSchema }, async ({ user, body }) => favouriteService.create(user, body));
