import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingRows } from "@/components/common/states";
import { LawTaskRegister } from "@/features/law/components/tasks/task-register";
import { guardModulePage } from "@/server/auth/page-guard";

export const metadata: Metadata = { title: "Law tasks" };

export default async function LawTasksPage() {
  await guardModulePage("law");
  return (
    <Suspense fallback={<LoadingRows rows={6} />}>
      <LawTaskRegister />
    </Suspense>
  );
}
