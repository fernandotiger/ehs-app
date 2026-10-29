import type { Metadata } from "next";
import { Suspense } from "react";
import { AccessDenied } from "@/components/common/access-denied";
import { LoadingRows } from "@/components/common/states";
import { DocumentLibrary } from "@/features/documents/components/manage/document-library";
import { guardModulePage } from "@/server/auth/page-guard";
import { DOCUMENT_PERMISSIONS } from "@/server/modules/documents/document-permissions";

export const metadata: Metadata = { title: "Document Library" };

export default async function DocumentLibraryPage() {
  if (!(await guardModulePage("documents", ...DOCUMENT_PERMISSIONS.LIBRARY))) return <AccessDenied />;
  return (
    <Suspense fallback={<LoadingRows rows={6} />}>
      <DocumentLibrary />
    </Suspense>
  );
}
