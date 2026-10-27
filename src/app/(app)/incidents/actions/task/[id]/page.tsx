import { notFound, redirect } from "next/navigation";
import { guardModulePage } from "@/server/auth/page-guard";
import { prisma } from "@/server/db/client";

/** Link target for task records (evidence, links): opens the task's action. */
export default async function IncidentTaskRedirect(props: PageProps<"/incidents/actions/task/[id]">) {
  await guardModulePage("incidents");
  const { id } = await props.params;
  const task = await prisma.actionTask.findUnique({ where: { id }, select: { actionId: true } });
  if (!task) notFound();
  redirect(`/incidents/actions/${task.actionId}`);
}
