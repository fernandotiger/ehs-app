import { PERMISSIONS } from "@/lib/permissions";
import { apiHandler } from "@/server/http/api-handler";
import { subscriptionService } from "@/server/modules/configuration/subscription.service";

/** GET /api/configuration/subscription – plan and modules (read-only; billing is not connected). */
export const GET = apiHandler({ permission: PERMISSIONS.CONFIG_SUBSCRIPTION }, async ({ user }) => subscriptionService.get(user));
