import { moveFavouriteSchema } from "@/lib/validation/favourites";
import { apiHandler } from "@/server/http/api-handler";
import { favouriteService } from "@/server/modules/favourites/favourite.service";

/** POST /api/favourites/:id/move – { direction: "up" | "down" } (Move earlier / Move later). */
export const POST = apiHandler({ body: moveFavouriteSchema }, async ({ user, params, body }) => {
  await favouriteService.move(user, params.id!, body);
});
