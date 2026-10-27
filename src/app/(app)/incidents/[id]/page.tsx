import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingRows } from "@/components/common/states";
import { IncidentDetail } from "@/features/incidents/components/detail/incident-detail";
import { guardModulePage } from "@/server/auth/page-guard";

export const metadata: Metadata = { title: "Incident" };

export default async function IncidentDetailPage(props: PageProps<"/incidents/[id]">) {
  await guardModulePage("incidents");
  const { id } = await props.params;
  return (
    <Suspense fallback={<LoadingRows rows={6} />}>
      <IncidentDetail id={id} />
    </Suspense>
  );
}
