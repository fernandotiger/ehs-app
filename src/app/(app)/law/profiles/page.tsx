import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingRows } from "@/components/common/states";
import { LawProfileList } from "@/features/law/components/profiles/profile-list";
import { guardModulePage } from "@/server/auth/page-guard";

export const metadata: Metadata = { title: "Legal profiles" };

export default async function LawProfilesPage() {
  await guardModulePage("law");
  return (
    <Suspense fallback={<LoadingRows rows={6} />}>
      <LawProfileList />
    </Suspense>
  );
}
