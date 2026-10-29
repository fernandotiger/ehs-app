import type { Metadata } from "next";
import { Suspense } from "react";
import { AccessDenied } from "@/components/common/access-denied";
import { LoadingRows } from "@/components/common/states";
import { SlawConfiguration } from "@/features/simplified-law/components/config/config-page";
import { PERMISSIONS } from "@/lib/permissions";
import { guardModulePage } from "@/server/auth/page-guard";

export const metadata: Metadata = { title: "Simplified law – Configuration" };

export default async function SimplifiedLawConfigurationPage() {
  if (!(await guardModulePage("simplified-law", PERMISSIONS.SLAW_MANAGE))) return <AccessDenied message="You don't have permission to configure Simplified law." />;
  return (
    <Suspense fallback={<LoadingRows rows={6} />}>
      <SlawConfiguration />
    </Suspense>
  );
}
