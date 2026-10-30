import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingRows } from "@/components/common/states";
import { MySurveys } from "@/features/documents/components/survey/my-surveys";
import { guardModulePage } from "@/server/auth/page-guard";

export const metadata: Metadata = { title: "My Response Forms" };

export default async function MySurveysPage() {
  await guardModulePage("documents");
  return (
    <Suspense fallback={<LoadingRows rows={6} />}>
      <MySurveys />
    </Suspense>
  );
}
