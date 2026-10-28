import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingRows } from "@/components/common/states";
import { RequirementRegister } from "@/features/law/components/requirements/requirement-register";
import { guardModulePage } from "@/server/auth/page-guard";

export const metadata: Metadata = { title: "Laws that apply to us" };

export default async function LawRequirementsPage() {
  await guardModulePage("law");
  return (
    <Suspense fallback={<LoadingRows rows={6} />}>
      <RequirementRegister />
    </Suspense>
  );
}
