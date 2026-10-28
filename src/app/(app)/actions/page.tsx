import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingRows } from "@/components/common/states";
import { MyActions } from "@/features/actions/components/my-actions";
import { guardModulePage } from "@/server/auth/page-guard";

export const metadata: Metadata = { title: "My Actions" };

export default async function MyActionsPage() {
  await guardModulePage("actions");
  return (
    <Suspense fallback={<LoadingRows rows={6} />}>
      <MyActions />
    </Suspense>
  );
}
