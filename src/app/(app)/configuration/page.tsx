import type { Metadata } from "next";
import { AccessDenied } from "@/components/common/access-denied";
import { ConfigurationHub } from "@/features/configuration/components/configuration-hub";
import { CONFIGURATION_PERMISSIONS } from "@/features/configuration/hub-cards";
import { guardPage } from "@/server/auth/page-guard";

export const metadata: Metadata = { title: "Configuration" };

export default async function ConfigurationPage() {
  if (!(await guardPage(...CONFIGURATION_PERMISSIONS))) return <AccessDenied />;
  return <ConfigurationHub />;
}
