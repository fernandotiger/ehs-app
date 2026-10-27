import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DocumentViewer } from "@/features/documents/components/document-viewer";
import { guardModulePage } from "@/server/auth/page-guard";
import { documentQueryService } from "@/server/modules/documents/document-query.service";

export const metadata: Metadata = { title: "Document" };

export default async function DocumentPage(props: PageProps<"/documents/[id]">) {
  const user = (await guardModulePage("documents"))!;
  const { id } = await props.params;
  // Same visibility policy as the API: out-of-scope documents are simply not found.
  if (!(await documentQueryService.canView(user, id))) notFound();
  return <DocumentViewer id={id} />;
}
