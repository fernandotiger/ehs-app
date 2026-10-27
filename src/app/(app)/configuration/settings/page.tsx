import type { Metadata } from "next";
import { AccessDenied } from "@/components/common/access-denied";
import { SystemSettingsForm } from "@/features/configuration/components/system-settings-form";
import { PERMISSIONS } from "@/lib/permissions";
import { guardPage } from "@/server/auth/page-guard";

export const metadata: Metadata = { title: "System settings" };

export default async function SystemSettingsPage() {
  if (!(await guardPage(PERMISSIONS.ADMIN_SETTINGS))) return <AccessDenied />;
  return <SystemSettingsForm />;
}
