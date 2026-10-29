import { legislationListQuerySchema } from "@/lib/validation/simplified-law";
import { apiHandler } from "@/server/http/api-handler";
import { slawRegisterService } from "@/server/modules/simplified-law/register.service";

/** GET /api/simplified-law/legislation – step 2: laws of a (sub-)category with jurisdiction, status and our check. */
export const GET = apiHandler({ module: "simplified-law", query: legislationListQuerySchema }, async ({ query, user }) => slawRegisterService.list(user, query));
