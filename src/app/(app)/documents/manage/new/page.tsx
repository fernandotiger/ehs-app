import type { Metadata } from "next";
import { AccessDenied } from "@/components/common/access-denied";
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
  return <NewDocumentForm prefill={prefill} />;
}
