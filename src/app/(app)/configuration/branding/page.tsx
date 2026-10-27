import type { Metadata } from "next";
import { Suspense } from "react";
import { AccessDenied } from "@/components/common/access-denied";
import { LoadingRows } from "@/components/common/states";
import { BrandingPage } from "@/features/configuration/components/branding-page";
import { PERMISSIONS } from "@/lib/permissions";
import { guardPage } from "@/server/auth/page-guard";

export const metadata: Metadata = { title: "Branding" };

export default async function ConfigurationBrandingPageRoute() {
  if (!(await guardPage(PERMISSIONS.CONFIG_BRANDING))) return <AccessDenied />;
  return (
    <Suspense fallback={<LoadingRows rows={8} />}>
      <BrandingPage />
    </Suspense>
  );
}
