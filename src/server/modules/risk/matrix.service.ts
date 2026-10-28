import "server-only";
import { readRiskSettings } from "@/lib/forms/settings";
import { PERMISSIONS } from "@/lib/permissions";
import { isRiskMethod } from "@/lib/risk/scoring";
import { hasCompanyScope } from "@/server/auth/authorization";
import type { CurrentUser } from "@/server/auth/current-user";
import { prisma } from "@/server/db/client";
import { ForbiddenError, NotFoundError } from "@/server/http/errors";
import { formService, type FormDetailDto } from "@/server/modules/forms/form.service";
import type { RiskFormRulesDto } from "./risk.dto";

/**
 * Configuration → Risk matrix & review rules. The rules ARE the Risk forms' settings, so this
 * screen lists Risk forms and edits their rules through the Form Builder service
 * (`PUT /api/forms/:id/risk-rules` → formService.saveRiskRules: a published form gets a new
 * version; assessments keep the rules they captured). Company-wide `risk.configure` (or Form
 * Builder publish rights) is required, like every configuration screen.
 */

export function requireRiskConfig(user: CurrentUser): void {
  if (!hasCompanyScope(user, PERMISSIONS.RISK_CONFIGURE) && !hasCompanyScope(user, PERMISSIONS.FORMS_PUBLISH)) {
    throw new ForbiddenError("Risk configuration applies only when assigned for the whole company.");
  }
}

export const riskMatrixService = {
  async list(user: CurrentUser): Promise<RiskFormRulesDto[]> {
    requireRiskConfig(user);
    const forms = await prisma.formDefinition.findMany({ where: { module: "risk" }, orderBy: { name: "asc" } });
    const versions = await prisma.formVersion.findMany({ where: { formId: { in: forms.map((f) => f.id) } }, select: { id: true, formId: true } });
    const counts = await prisma.riskAssessment.groupBy({ by: ["formVersionId"], where: { formVersionId: { in: versions.map((v) => v.id) } }, _count: { _all: true } });
    const byVersion = new Map(counts.map((c) => [c.formVersionId, c._count._all]));
    return forms.map((f) => {
      const settings = readRiskSettings(f.settings);
      return {
        id: f.id,
        name: f.name,
        method: isRiskMethod(f.purpose) ? f.purpose : "5x5",
        domain: settings?.domain ?? "HEALTH_SAFETY",
        status: f.status,
        currentVersion: f.currentVersion,
        settings,
        assessmentCount: versions.filter((v) => v.formId === f.id).reduce((sum, v) => sum + (byVersion.get(v.id) ?? 0), 0),
      };
    });
  },

  async form(user: CurrentUser, id: string): Promise<FormDetailDto> {
    requireRiskConfig(user);
    const detail = await formService.get(id, user);
    if (detail.module !== "risk") throw new NotFoundError();
    return detail;
  },
};
