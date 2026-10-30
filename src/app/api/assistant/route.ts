import { apiHandler } from "@/server/http/api-handler";
import { assistantService } from "@/server/modules/assistant/assistant.service";

/** GET /api/assistant – what the chat pop-up needs: state (ready / disabled / not-configured), name, welcome, suggestions. */
export const GET = apiHandler({}, async ({ user }) => assistantService.status(user));
