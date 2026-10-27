import type { Metadata } from "next";
import { AccessDenied } from "@/components/common/access-denied";
import { UsersPage } from "@/features/configuration/components/users-page";
import { PERMISSIONS } from "@/lib/permissions";
import { guardPage } from "@/server/auth/page-guard";

export const metadata: Metadata = { title: "Users" };

export default async function ConfigurationUsersPage() {
  if (!(await guardPage(PERMISSIONS.ADMIN_USERS))) return <AccessDenied />;
  return <UsersPage />;
}
