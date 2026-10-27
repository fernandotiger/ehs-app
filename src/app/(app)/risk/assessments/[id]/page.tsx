import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingRows } from "@/components/common/states";
import { AssessmentDetail } from "@/features/risk/components/assessments/assessment-detail";
import { guardModulePage } from "@/server/auth/page-guard";

export const metadata: Metadata = { title: "Risk assessment" };

export default async function AssessmentDetailPage(props: PageProps<"/risk/assessments/[id]">) {
  await guardModulePage("risk");
  const { id } = await props.params;
  return (
    <Suspense fallback={<LoadingRows rows={6} />}>
      <AssessmentDetail id={id} />
    </Suspense>
  );
}
