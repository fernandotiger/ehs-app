import { notFound, redirect } from "next/navigation";
import { guardModulePage } from "@/server/auth/page-guard";
import { prisma } from "@/server/db/client";

/** Link target for investigation records (evidence, links): opens the incident's Investigation tab. */
export default async function InvestigationRedirect(props: PageProps<"/incidents/investigation/[id]">) {
  await guardModulePage("incidents");
  const { id } = await props.params;
  const row = await prisma.investigation.findUnique({ where: { id }, select: { incidentId: true } });
  if (!row) notFound();
  redirect(`/incidents/${row.incidentId}?tab=investigation`);
}
