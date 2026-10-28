import "server-only";
import { PERMISSIONS } from "@/lib/permissions";
import { recordAudit } from "@/server/audit/audit-service";
import { hasCompanyScope } from "@/server/auth/authorization";
import type { CurrentUser } from "@/server/auth/current-user";
import { prisma } from "@/server/db/client";
import type { RequestMeta } from "@/server/http/api-handler";
import { ForbiddenError } from "@/server/http/errors";
import { requireTenantId } from "@/server/tenancy/context";
import { lawContentService, type LawLibraryDto } from "./content.service";
import { ensureNonComplianceType, nonComplianceReadiness, type NonComplianceReadiness } from "./incident-type";

/** Configuration → Law content & settings: the library plus the Non Compliance incident type Law raises drafts with. */

export interface LawSettingsDto {
  library: LawLibraryDto;
  incidentsEnabled: boolean;
  incidentType: NonComplianceReadiness;
  /** Setting the type up needs the Configure incidents permission for the whole company. */
  canSetUpIncidentType: boolean;
}

export const lawSettingsService = {
  async get(user: CurrentUser): Promise<LawSettingsDto> {
    const incidentsEnabled = user.enabledModules.includes("incidents");
    return {
      library: await lawContentService.library(user),
      incidentsEnabled,
      incidentType: incidentsEnabled ? await nonComplianceReadiness(prisma, requireTenantId()) : { ready: false, problem: "The Incidents module is not enabled.", typeName: null, formName: null, fixable: false },
      canSetUpIncidentType: incidentsEnabled && hasCompanyScope(user, PERMISSIONS.INCIDENT_CONFIGURE),
    };
  },

  async setUpIncidentType(user: CurrentUser, meta: RequestMeta): Promise<NonComplianceReadiness> {
    if (!user.enabledModules.includes("incidents") || !hasCompanyScope(user, PERMISSIONS.INCIDENT_CONFIGURE)) {
      throw new ForbiddenError("Setting up incident types needs the Configure incidents permission for the whole company.");
    }
    const organizationId = requireTenantId();
    return prisma.$transaction(async (tx) => {
      const { typeId, changes } = await ensureNonComplianceType(tx, organizationId);
      if (changes.length) {
        await recordAudit({ entityType: "IncidentType", entityId: typeId, action: "INCIDENT_TYPE_UPDATED", actor: user, changes: { setUpForLaw: changes }, meta }, tx);
      }
      return nonComplianceReadiness(tx, organizationId);
    });
  },
};
