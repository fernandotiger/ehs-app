import { apiHandler } from "@/server/http/api-handler";

/** GET /api/me – the signed-in user with effective permissions. */
export const GET = apiHandler({}, async ({ user }) => user);
