import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingRows } from "@/components/common/states";
import { AssessmentEdit } from "@/features/risk/components/assessments/assessment-edit";
import { guardModulePage } from "@/server/auth/page-guard";

export const metadata: Metadata = { title: "Edit risk assessment" };

export default async function AssessmentEditPage(props: PageProps<"/risk/assessments/[id]/edit">) {
  await guardModulePage("risk");
  const { id } = await props.params;
  return (
    <Suspense fallback={<LoadingRows rows={6} />}>
      <AssessmentEdit id={id} />
    </Suspense>
  );
}
