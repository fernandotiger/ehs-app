import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingRows } from "@/components/common/states";
import { LawTaskDetail } from "@/features/law/components/tasks/task-detail";
import { guardModulePage } from "@/server/auth/page-guard";

export const metadata: Metadata = { title: "Law task" };

export default async function LawTaskPage(props: PageProps<"/law/tasks/[id]">) {
  await guardModulePage("law");
  const { id } = await props.params;
  return (
    <Suspense fallback={<LoadingRows rows={6} />}>
      <LawTaskDetail id={id} />
    </Suspense>
  );
}
