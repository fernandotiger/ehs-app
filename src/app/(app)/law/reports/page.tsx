import type { Metadata } from "next";
import { Suspense } from "react";
import { AccessDenied } from "@/components/common/access-denied";
import { LoadingRows } from "@/components/common/states";
import { LawReports } from "@/features/law/components/reports/law-reports";
import { PERMISSIONS } from "@/lib/permissions";
import { guardModulePage } from "@/server/auth/page-guard";

export const metadata: Metadata = { title: "Law reports" };

export default async function LawReportsPage() {
  const user = await guardModulePage("law", PERMISSIONS.LAW_VIEW);
  if (!user) return <AccessDenied message="Law reports need the View requirements permission." />;
  return (
    <Suspense fallback={<LoadingRows rows={6} />}>
      <LawReports />
    </Suspense>
  );
}
