import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingRows } from "@/components/common/states";
import { TargetDetail } from "@/features/risk/components/strategy/strategy-detail";
import { guardModulePage } from "@/server/auth/page-guard";

export const metadata: Metadata = { title: "Target" };

export default async function TargetPage(props: PageProps<"/risk/strategy/targets/[id]">) {
  await guardModulePage("risk");
  const { id } = await props.params;
  return (
    <Suspense fallback={<LoadingRows rows={6} />}>
      <TargetDetail id={id} />
    </Suspense>
  );
}
