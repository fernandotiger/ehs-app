import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingRows } from "@/components/common/states";
import { MyDocuments } from "@/features/documents/components/my-documents";
import { guardModulePage } from "@/server/auth/page-guard";

export const metadata: Metadata = { title: "My Documents" };

export default async function MyDocumentsPage() {
  await guardModulePage("documents");
  return (
    <Suspense fallback={<LoadingRows rows={6} />}>
      <MyDocuments />
    </Suspense>
  );
}
