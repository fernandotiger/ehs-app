import type { Metadata } from "next";
import { AccessDenied } from "@/components/common/access-denied";
import { DocumentLibrary } from "@/features/documents/components/manage/document-library";
import { guardModulePage } from "@/server/auth/page-guard";
import { DOCUMENT_PERMISSIONS } from "@/server/modules/documents/document-permissions";

export const metadata: Metadata = { title: "Document Library" };

export default async function DocumentLibraryPage() {
  if (!(await guardModulePage("documents", ...DOCUMENT_PERMISSIONS.LIBRARY))) return <AccessDenied />;
  return <DocumentLibrary />;
}
