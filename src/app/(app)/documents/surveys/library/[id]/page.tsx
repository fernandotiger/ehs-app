import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { AccessDenied } from "@/components/common/access-denied";
import { SurveyManage } from "@/features/documents/components/survey/survey-manage";
import { guardModulePage } from "@/server/auth/page-guard";
import { DOCUMENT_PERMISSIONS } from "@/server/modules/documents/document-permissions";
import { documentQueryService } from "@/server/modules/documents/document-query.service";

export const metadata: Metadata = { title: "Response Form" };

export default async function SurveyPage(props: PageProps<"/documents/surveys/library/[id]">) {
  if (!(await guardModulePage("documents", ...DOCUMENT_PERMISSIONS.LIBRARY))) return <AccessDenied />;
  const { id } = await props.params;
  if (!(await documentQueryService.exists(id))) notFound();
  // A plain document has its own management page.
  if (!(await documentQueryService.isSurvey(id))) redirect(`/documents/manage/${id}`);
  return <SurveyManage id={id} />;
}
