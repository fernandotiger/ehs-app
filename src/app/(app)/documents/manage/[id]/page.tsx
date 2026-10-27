import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { AccessDenied } from "@/components/common/access-denied";
import { DocumentManage } from "@/features/documents/components/manage/document-manage";
import { guardModulePage } from "@/server/auth/page-guard";
import { DOCUMENT_PERMISSIONS } from "@/server/modules/documents/document-permissions";
import { documentQueryService } from "@/server/modules/documents/document-query.service";

export const metadata: Metadata = { title: "Manage document" };

export default async function ManageDocumentPage(props: PageProps<"/documents/manage/[id]">) {
  if (!(await guardModulePage("documents", ...DOCUMENT_PERMISSIONS.LIBRARY))) return <AccessDenied />;
  const { id } = await props.params;
  if (!(await documentQueryService.exists(id))) notFound();
  // Surveys have their own page in the Survey Library (old links and notifications land there).
  if (await documentQueryService.isSurvey(id)) redirect(`/documents/surveys/library/${id}`);
  return <DocumentManage id={id} />;
}
