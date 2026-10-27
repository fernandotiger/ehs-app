import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingRows } from "@/components/common/states";
import { TaskDetail } from "@/features/risk/components/tasks/task-detail";
import { guardModulePage } from "@/server/auth/page-guard";

export const metadata: Metadata = { title: "Risk task" };

export default async function RiskTaskPage(props: PageProps<"/risk/tasks/[id]">) {
  await guardModulePage("risk");
  const { id } = await props.params;
  return (
    <Suspense fallback={<LoadingRows rows={6} />}>
      <TaskDetail id={id} />
    </Suspense>
  );
}
