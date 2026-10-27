import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingRows } from "@/components/common/states";
import { IncidentRegister } from "@/features/incidents/components/register/incident-register";
import { guardModulePage } from "@/server/auth/page-guard";

export const metadata: Metadata = { title: "Incidents register" };

export default async function IncidentRegisterPage() {
  await guardModulePage("incidents");
  return (
    <Suspense fallback={<LoadingRows rows={8} />}>
      <IncidentRegister />
    </Suspense>
  );
}
