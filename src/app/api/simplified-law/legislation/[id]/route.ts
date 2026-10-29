import { apiHandler } from "@/server/http/api-handler";
import { slawRegisterService } from "@/server/modules/simplified-law/register.service";

/** GET /api/simplified-law/legislation/:id – overview, applicability questions, requirements, next step and rights. */
export const GET = apiHandler({ module: "simplified-law" }, async ({ params, user }) => slawRegisterService.detail(user, params.id!));
