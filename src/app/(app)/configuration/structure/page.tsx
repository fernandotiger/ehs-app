import type { Metadata } from "next";
import { Suspense } from "react";
import { AccessDenied } from "@/components/common/access-denied";
import { LoadingRows } from "@/components/common/states";
import { StructurePage } from "@/features/configuration/components/structure-page";
import { PERMISSIONS } from "@/lib/permissions";
import { guardPage } from "@/server/auth/page-guard";

export const metadata: Metadata = { title: "Company structure" };

export default async function CompanyStructurePage() {
  if (!(await guardPage(PERMISSIONS.ADMIN_ORGANISATION))) return <AccessDenied />;
  return (
    <Suspense fallback={<LoadingRows rows={8} />}>
      <StructurePage />
    </Suspense>
  );
}
