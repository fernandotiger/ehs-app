import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingRows } from "@/components/common/states";
import { ScanPage } from "@/features/risk/components/scan/scan-page";
import { guardModulePage } from "@/server/auth/page-guard";

export const metadata: Metadata = { title: "Scan a label" };

export default async function ScanRoute() {
  await guardModulePage("risk");
  return (
    <Suspense fallback={<LoadingRows rows={6} />}>
      <ScanPage />
    </Suspense>
  );
}
