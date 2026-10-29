import { apiHandler } from "@/server/http/api-handler";
import { slawRegisterService } from "@/server/modules/simplified-law/register.service";

/** GET /api/simplified-law/summary – counts for the Overview banner. */
export const GET = apiHandler({ module: "simplified-law" }, async ({ user }) => slawRegisterService.summary(user));
