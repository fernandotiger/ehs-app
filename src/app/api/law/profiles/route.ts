import { z } from "zod";
import { lawProfileCreateSchema } from "@/lib/validation/law";
import { apiHandler } from "@/server/http/api-handler";
import { lawQueryService } from "@/server/modules/law/law-query.service";
import { lawProfileService } from "@/server/modules/law/profile.service";

const query = z.object({ archived: z.enum(["true", "false"]).optional() });

/** GET /api/law/profiles – profiles I may see, with their compliance summary (`archived=true` includes archived ones). */
export const GET = apiHandler({ module: "law", query }, async ({ query, user }) => lawQueryService.profiles(user, query.archived === "true"));

/** POST /api/law/profiles – new profile on the latest installed content; requirements that apply are created. */
export const POST = apiHandler({ module: "law", body: lawProfileCreateSchema }, async ({ body, user, meta }) => lawProfileService.create(body, user, meta));
