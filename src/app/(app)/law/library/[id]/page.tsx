import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingRows } from "@/components/common/states";
import { LegislationDetail } from "@/features/law/components/library/legislation-detail";
import { guardModulePage } from "@/server/auth/page-guard";

export const metadata: Metadata = { title: "Law library" };

export default async function LegislationPage(props: PageProps<"/law/library/[id]">) {
  await guardModulePage("law");
  const { id } = await props.params;
  return (
    <Suspense fallback={<LoadingRows rows={6} />}>
      <LegislationDetail id={id} />
    </Suspense>
  );
}
