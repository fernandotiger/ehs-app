import type { Metadata } from "next";
import { AssessmentPrint } from "@/features/risk/components/assessments/assessment-print";
import { guardModulePage } from "@/server/auth/page-guard";

export const metadata: Metadata = { title: "Print risk assessment" };

export default async function AssessmentPrintPage(props: { params: Promise<{ id: string }> }) {
  await guardModulePage("risk");
  const { id } = await props.params;
  return <AssessmentPrint id={id} />;
}
