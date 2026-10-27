import type { Metadata } from "next";
import { Suspense } from "react";
import { AccessDenied } from "@/components/common/access-denied";
import { LoadingRows } from "@/components/common/states";
import { RolesPage } from "@/features/configuration/components/roles-page";
import { PERMISSIONS } from "@/lib/permissions";
import { guardPage } from "@/server/auth/page-guard";

export const metadata: Metadata = { title: "Roles & permissions" };

export default async function ConfigurationRolesPage() {
  if (!(await guardPage(PERMISSIONS.ADMIN_ROLES))) return <AccessDenied />;
  return (
    <Suspense fallback={<LoadingRows rows={8} />}>
      <RolesPage />
    </Suspense>
  );
}
