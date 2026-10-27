import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingRows } from "@/components/common/states";
import { ProgrammeDetail } from "@/features/risk/components/strategy/strategy-detail";
import { guardModulePage } from "@/server/auth/page-guard";

export const metadata: Metadata = { title: "Management programme" };

export default async function ProgrammePage(props: PageProps<"/risk/strategy/programmes/[id]">) {
  await guardModulePage("risk");
  const { id } = await props.params;
  return (
    <Suspense fallback={<LoadingRows rows={6} />}>
      <ProgrammeDetail id={id} />
    </Suspense>
  );
}
