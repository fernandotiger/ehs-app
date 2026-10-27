import type { Metadata } from "next";
import { MyDocuments } from "@/features/documents/components/my-documents";
import { guardModulePage } from "@/server/auth/page-guard";

export const metadata: Metadata = { title: "My Documents" };

export default async function MyDocumentsPage() {
  await guardModulePage("documents");
  return <MyDocuments />;
}
