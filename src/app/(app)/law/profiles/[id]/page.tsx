import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingRows } from "@/components/common/states";
import { LawProfileDetail } from "@/features/law/components/profiles/profile-detail";
import { guardModulePage } from "@/server/auth/page-guard";

export const metadata: Metadata = { title: "Legal profile" };

export default async function LawProfilePage(props: PageProps<"/law/profiles/[id]">) {
  await guardModulePage("law");
  const { id } = await props.params;
  return (
    <Suspense fallback={<LoadingRows rows={6} />}>
      <LawProfileDetail id={id} />
    </Suspense>
  );
}
