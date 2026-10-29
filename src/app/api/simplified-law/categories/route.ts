import { z } from "zod";
import { apiHandler } from "@/server/http/api-handler";
import { slawRegisterService } from "@/server/modules/simplified-law/register.service";
import { canManage } from "@/server/modules/simplified-law/slaw-access.policy";

const query = z.object({ archived: z.enum(["true", "false"]).default("false") });

/** GET /api/simplified-law/categories – category → sub-category tree with law counts (`archived=true` for Configuration). */
export const GET = apiHandler({ module: "simplified-law", query }, async ({ query, user }) => slawRegisterService.categories(user, query.archived === "true" && canManage(user)));
