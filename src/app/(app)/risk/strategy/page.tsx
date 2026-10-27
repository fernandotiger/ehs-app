import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingRows } from "@/components/common/states";
import { StrategyPage } from "@/features/risk/components/strategy/strategy-page";
import { guardModulePage } from "@/server/auth/page-guard";

export const metadata: Metadata = { title: "Objectives & programmes" };

export default async function RiskStrategyPage() {
  await guardModulePage("risk");
  return (
    <Suspense fallback={<LoadingRows rows={6} />}>
      <StrategyPage />
    </Suspense>
  );
}
