import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingRows } from "@/components/common/states";
import { ObjectiveDetail } from "@/features/risk/components/strategy/strategy-detail";
import { guardModulePage } from "@/server/auth/page-guard";

export const metadata: Metadata = { title: "Objective" };

export default async function ObjectivePage(props: PageProps<"/risk/strategy/objectives/[id]">) {
  await guardModulePage("risk");
  const { id } = await props.params;
  return (
    <Suspense fallback={<LoadingRows rows={6} />}>
      <ObjectiveDetail id={id} />
    </Suspense>
  );
}
