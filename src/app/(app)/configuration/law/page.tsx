import type { Metadata } from "next";
import { AccessDenied } from "@/components/common/access-denied";
import { LawSettings } from "@/features/law/components/config/law-settings";
import { PERMISSIONS } from "@/lib/permissions";
import { guardModulePage } from "@/server/auth/page-guard";

export const metadata: Metadata = { title: "Law content & settings" };

export default async function LawSettingsPage() {
  const user = await guardModulePage("law", PERMISSIONS.LAW_REQUIREMENT_MANAGE, PERMISSIONS.INCIDENT_CONFIGURE);
  if (!user) return <AccessDenied message="Law content & settings need the Manage requirements or Configure incidents permission." />;
  return <LawSettings />;
}
