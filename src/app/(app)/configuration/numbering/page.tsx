import type { Metadata } from "next";
import { Suspense } from "react";
import { AccessDenied } from "@/components/common/access-denied";
import { LoadingRows } from "@/components/common/states";
import { NumberingPage } from "@/features/configuration/components/numbering-page";
import { PERMISSIONS } from "@/lib/permissions";
import { guardPage } from "@/server/auth/page-guard";

export const metadata: Metadata = { title: "Reference numbers" };

export default async function ConfigurationNumberingPageRoute() {
  if (!(await guardPage(PERMISSIONS.CONFIG_LISTS))) return <AccessDenied />;
  return (
    <Suspense fallback={<LoadingRows rows={8} />}>
      <NumberingPage />
    </Suspense>
  );
}
