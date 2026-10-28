import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingRows } from "@/components/common/states";
import { LawLibrary } from "@/features/law/components/library/law-library";
import { guardModulePage } from "@/server/auth/page-guard";

export const metadata: Metadata = { title: "Law library" };

export default async function LawLibraryPage() {
  await guardModulePage("law");
  return (
    <Suspense fallback={<LoadingRows rows={6} />}>
      <LawLibrary />
    </Suspense>
  );
}
