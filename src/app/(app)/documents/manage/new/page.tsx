import type { Metadata } from "next";
import { Suspense } from "react";
import { AccessDenied } from "@/components/common/access-denied";
import { LoadingCards } from "@/components/common/states";
import { NewDocumentForm } from "@/features/documents/components/manage/new-document-form";
import { guardModulePage } from "@/server/auth/page-guard";
import { DOCUMENT_PERMISSIONS } from "@/server/modules/documents/document-permissions";

export const metadata: Metadata = { title: "Upload document" };

const one = (value: string | string[] | undefined) => (typeof value === "string" && value.trim() ? value : undefined);

export default async function NewDocumentPage(props: PageProps<"/documents/manage/new">) {
  if (!(await guardModulePage("documents", ...DOCUMENT_PERMISSIONS.MANAGE))) return <AccessDenied />;
  // ?uploadId=…&title=…&description=… – a file prepared elsewhere (e.g. Risk → Save as document (PDF)).
  const query = await props.searchParams;
  const uploadId = one(query.uploadId);
  const prefill = uploadId ? { uploadId, title: one(query.title)?.slice(0, 200), description: one(query.description)?.slice(0, 4000) } : undefined;
  // The form also reads `?fav=` (a favourite's kept values), so it sits in its own Suspense boundary.
  return (
    <Suspense fallback={<LoadingCards count={3} />}>
      <NewDocumentForm prefill={prefill} />
    </Suspense>
  );
}
