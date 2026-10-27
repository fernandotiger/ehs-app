import type { Metadata } from "next";
import { Suspense } from "react";
import { AccessDenied } from "@/components/common/access-denied";
import { LoadingRows } from "@/components/common/states";
import { ImportPage } from "@/features/configuration/components/import-page";
import { PERMISSIONS } from "@/lib/permissions";
import { guardPage } from "@/server/auth/page-guard";

export const metadata: Metadata = { title: "Bulk import" };

export default async function ConfigurationImportPageRoute() {
  if (!(await guardPage(PERMISSIONS.CONFIG_BULK_IMPORT))) return <AccessDenied />;
  return (
    <Suspense fallback={<LoadingRows rows={8} />}>
      <ImportPage />
    </Suspense>
  );
}
