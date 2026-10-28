import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingRows } from "@/components/common/states";
import { ActionDetail } from "@/features/actions/components/action-detail";
import { guardModulePage } from "@/server/auth/page-guard";

export const metadata: Metadata = { title: "Action" };

export default async function ActionPage(props: PageProps<"/actions/[id]">) {
  await guardModulePage("actions");
  const { id } = await props.params;
  return (
    <Suspense fallback={<LoadingRows rows={6} />}>
      <ActionDetail id={id} />
    </Suspense>
  );
}
