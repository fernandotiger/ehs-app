import { lawLinkCreateSchema } from "@/lib/validation/law";
import { apiHandler } from "@/server/http/api-handler";
import { lawConnectionService } from "@/server/modules/law/connections.service";

/** GET /api/law/requirements/:id/links – linked Risk assessments, Incidents and Incident actions. */
export const GET = apiHandler({ module: "law" }, async ({ params, user }) => lawConnectionService.links(user, params.id!));

/** POST /api/law/requirements/:id/links – link an existing record of the profile's site (idempotent). */
export const POST = apiHandler({ module: "law", body: lawLinkCreateSchema }, async ({ params, body, user, meta }) => lawConnectionService.link(user, params.id!, body, meta));
