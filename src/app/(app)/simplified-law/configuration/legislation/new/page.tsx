import type { Metadata } from "next";
import { Suspense } from "react";
import { AccessDenied } from "@/components/common/access-denied";
import { LoadingRows } from "@/components/common/states";
import { NewLegislation } from "@/features/simplified-law/components/config/legislation-editor";
import { PERMISSIONS } from "@/lib/permissions";
import { guardModulePage } from "@/server/auth/page-guard";

export const metadata: Metadata = { title: "Add a law" };

export default async function SimplifiedLawNewLegislationPage() {
  if (!(await guardModulePage("simplified-law", PERMISSIONS.SLAW_MANAGE))) return <AccessDenied message="You don't have permission to configure Simplified law." />;
  return (
    <Suspense fallback={<LoadingRows rows={6} />}>
      <NewLegislation />
    </Suspense>
  );
}
