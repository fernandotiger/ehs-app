import type { Metadata } from "next";
import { Suspense } from "react";
import { AccessDenied } from "@/components/common/access-denied";
import { LoadingRows } from "@/components/common/states";
import { SlawOverview } from "@/features/simplified-law/components/overview-page";
import { PERMISSIONS as P } from "@/lib/permissions";
import { guardModulePage } from "@/server/auth/page-guard";

export const metadata: Metadata = { title: "Simplified law" };

export default async function SimplifiedLawPage() {
  if (!(await guardModulePage("simplified-law", P.SLAW_VIEW, P.SLAW_ASSESS, P.SLAW_MANAGE))) return <AccessDenied message="You don't have access to the legislation register. Your own actions are under Actions to do." />;
  return (
    <Suspense fallback={<LoadingRows rows={6} />}>
      <SlawOverview />
    </Suspense>
  );
}
