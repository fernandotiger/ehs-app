import type { Metadata } from "next";
import { IncidentEdit } from "@/features/incidents/components/report/incident-edit";
import { guardModulePage } from "@/server/auth/page-guard";

export const metadata: Metadata = { title: "Edit incident" };

export default async function EditIncidentPage(props: PageProps<"/incidents/[id]/edit">) {
  await guardModulePage("incidents");
  const { id } = await props.params;
  return <IncidentEdit id={id} />;
}
