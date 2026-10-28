import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingRows } from "@/components/common/states";
import { LawOverview } from "@/features/law/components/overview/law-overview";
import { guardModulePage } from "@/server/auth/page-guard";

export const metadata: Metadata = { title: "Law & compliance" };

export default async function LawOverviewPage() {
  await guardModulePage("law");
  return (
    <Suspense fallback={<LoadingRows rows={6} />}>
      <LawOverview />
    </Suspense>
  );
}
