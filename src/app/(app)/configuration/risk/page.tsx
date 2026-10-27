import type { Metadata } from "next";
import { AccessDenied } from "@/components/common/access-denied";
import { RiskMatrixConfig } from "@/features/risk/components/config/risk-matrix-config";
import { PERMISSIONS } from "@/lib/permissions";
import { hasCompanyScope } from "@/server/auth/authorization";
import { guardModulePage } from "@/server/auth/page-guard";

export const metadata: Metadata = { title: "Risk matrix & review rules" };

export default async function RiskMatrixPage() {
  const user = await guardModulePage("risk", PERMISSIONS.RISK_CONFIGURE, PERMISSIONS.FORMS_PUBLISH);
  if (!user || !(hasCompanyScope(user, PERMISSIONS.RISK_CONFIGURE) || hasCompanyScope(user, PERMISSIONS.FORMS_PUBLISH))) {
    return <AccessDenied message="Risk matrix settings need the Configure risk permission for the whole company." />;
  }
  return <RiskMatrixConfig />;
}
