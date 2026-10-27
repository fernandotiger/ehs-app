import type { Metadata } from "next";
import { ActionDetail } from "@/features/incidents/components/actions/action-detail";
import { guardModulePage } from "@/server/auth/page-guard";

export const metadata: Metadata = { title: "Action" };

export default async function IncidentActionPage(props: PageProps<"/incidents/actions/[id]">) {
  await guardModulePage("incidents");
  const { id } = await props.params;
  return <ActionDetail id={id} />;
}
