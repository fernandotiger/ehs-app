import type { Metadata } from "next";
import { AccessDenied } from "@/components/common/access-denied";
import { NewDocumentForm } from "@/features/documents/components/manage/new-document-form";
import { guardModulePage } from "@/server/auth/page-guard";
import { DOCUMENT_PERMISSIONS } from "@/server/modules/documents/document-permissions";

export const metadata: Metadata = { title: "Upload document" };

export default async function NewDocumentPage() {
  if (!(await guardModulePage("documents", ...DOCUMENT_PERMISSIONS.MANAGE))) return <AccessDenied />;
  return <NewDocumentForm />;
}
