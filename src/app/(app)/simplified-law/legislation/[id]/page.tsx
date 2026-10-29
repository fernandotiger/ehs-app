import type { Metadata } from "next";
import { Suspense } from "react";
import { AccessDenied } from "@/components/common/access-denied";
import { LoadingRows } from "@/components/common/states";
import { LegislationDetail } from "@/features/simplified-law/components/legislation-detail";
import { PERMISSIONS as P } from "@/lib/permissions";
import { guardModulePage } from "@/server/auth/page-guard";

export const metadata: Metadata = { title: "Legislation" };

export default async function SimplifiedLawLegislationDetailPage(props: PageProps<"/simplified-law/legislation/[id]">) {
  if (!(await guardModulePage("simplified-law", P.SLAW_VIEW, P.SLAW_ASSESS, P.SLAW_MANAGE))) return <AccessDenied message="You don't have access to the legislation register." />;
  const { id } = await props.params;
  return (
    <Suspense fallback={<LoadingRows rows={6} />}>
      <LegislationDetail id={id} />
    </Suspense>
  );
}
