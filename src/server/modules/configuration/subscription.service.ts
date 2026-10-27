import "server-only";
import { MODULE_KEYS, MODULES, type ModuleKey } from "@/lib/modules";
import { PERMISSIONS } from "@/lib/permissions";
import type { CurrentUser } from "@/server/auth/current-user";
import { systemPrisma } from "@/server/db/client";
import { NotFoundError } from "@/server/http/errors";
import { requireCompanyConfig } from "./config-access";

export interface SubscriptionDto {
  plan: string;
  status: string;
  /** Billing is not connected in this build – plan changes are made by the platform team. */
  billingConnected: false;
  modules: { key: ModuleKey; name: string; description: string; enabled: boolean }[];
}

/** Read-only view of the tenant's plan and modules (changed with scripts/set-modules.ts). */
export const subscriptionService = {
  async get(actor: CurrentUser): Promise<SubscriptionDto> {
    requireCompanyConfig(actor, PERMISSIONS.CONFIG_SUBSCRIPTION);
    const org = await systemPrisma.organization.findUnique({
      where: { id: actor.organizationId },
      select: { plan: true, status: true, enabledModules: true },
    });
    if (!org) throw new NotFoundError();
    return {
      plan: org.plan,
      status: org.status,
      billingConnected: false,
      modules: MODULE_KEYS.map((key) => ({ key, name: MODULES[key].name, description: MODULES[key].description, enabled: org.enabledModules.includes(key) })),
    };
  },
};
