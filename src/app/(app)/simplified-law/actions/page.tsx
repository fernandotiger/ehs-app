import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingRows } from "@/components/common/states";
import { SlawActions } from "@/features/simplified-law/components/actions-page";
import { guardModulePage } from "@/server/auth/page-guard";

export const metadata: Metadata = { title: "Actions to do" };

/** Everyone may open it: people without register access see the actions they own. */
export default async function SimplifiedLawActionsPage() {
  await guardModulePage("simplified-law");
  return (
    <Suspense fallback={<LoadingRows rows={6} />}>
      <SlawActions />
    </Suspense>
  );
}
