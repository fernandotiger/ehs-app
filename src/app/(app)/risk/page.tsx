import type { Metadata } from "next";
import { RiskOverview } from "@/features/risk/components/overview/risk-overview";
import { guardModulePage } from "@/server/auth/page-guard";

export const metadata: Metadata = { title: "Risk" };

export default async function RiskOverviewPage() {
  await guardModulePage("risk");
  return <RiskOverview />;
}
