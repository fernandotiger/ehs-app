import type { Metadata } from "next";
import { Suspense } from "react";
import { AccessDenied } from "@/components/common/access-denied";
import { LoadingRows } from "@/components/common/states";
import { LegislationList } from "@/features/simplified-law/components/legislation-list";
import { PERMISSIONS as P } from "@/lib/permissions";
import { guardModulePage } from "@/server/auth/page-guard";

export const metadata: Metadata = { title: "Legislation" };

export default async function SimplifiedLawLegislationPage() {
  if (!(await guardModulePage("simplified-law", P.SLAW_VIEW, P.SLAW_ASSESS, P.SLAW_MANAGE))) return <AccessDenied message="You don't have access to the legislation register." />;
  return (
    <Suspense fallback={<LoadingRows rows={6} />}>
      <LegislationList />
    </Suspense>
  );
}
