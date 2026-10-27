import type { Metadata } from "next";
import { AccessDenied } from "@/components/common/access-denied";
import { AuditLog } from "@/features/configuration/components/audit-log";
import { PERMISSIONS } from "@/lib/permissions";
import { guardPage } from "@/server/auth/page-guard";

export const metadata: Metadata = { title: "Audit log" };

export default async function AuditLogPage() {
  if (!(await guardPage(PERMISSIONS.ADMIN_AUDIT))) return <AccessDenied />;
  return <AuditLog />;
}
