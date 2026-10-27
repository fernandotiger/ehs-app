import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingRows } from "@/components/common/states";
import { ActionRegister } from "@/features/incidents/components/actions/action-register";
import { guardModulePage } from "@/server/auth/page-guard";

export const metadata: Metadata = { title: "Actions" };

export default async function IncidentActionsPage() {
  await guardModulePage("incidents");
  return (
    <Suspense fallback={<LoadingRows rows={8} />}>
      <ActionRegister />
    </Suspense>
  );
}
