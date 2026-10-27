import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingRows } from "@/components/common/states";
import { TaskRegister } from "@/features/risk/components/tasks/task-register";
import { guardModulePage } from "@/server/auth/page-guard";

export const metadata: Metadata = { title: "Risk tasks" };

export default async function RiskTasksPage() {
  await guardModulePage("risk");
  return (
    <Suspense fallback={<LoadingRows rows={6} />}>
      <TaskRegister />
    </Suspense>
  );
}
