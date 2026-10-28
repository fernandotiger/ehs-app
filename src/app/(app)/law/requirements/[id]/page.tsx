import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingRows } from "@/components/common/states";
import { RequirementDetail } from "@/features/law/components/requirements/requirement-detail";
import { guardModulePage } from "@/server/auth/page-guard";

export const metadata: Metadata = { title: "Legal requirement" };

export default async function LawRequirementPage(props: PageProps<"/law/requirements/[id]">) {
  await guardModulePage("law");
  const { id } = await props.params;
  return (
    <Suspense fallback={<LoadingRows rows={6} />}>
      <RequirementDetail id={id} />
    </Suspense>
  );
}
