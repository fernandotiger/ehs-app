import type { Metadata } from "next";
import { Suspense } from "react";
import { AccessDenied } from "@/components/common/access-denied";
import { LoadingRows } from "@/components/common/states";
import { EditLegislation } from "@/features/simplified-law/components/config/legislation-editor";
import { PERMISSIONS } from "@/lib/permissions";
import { guardModulePage } from "@/server/auth/page-guard";

export const metadata: Metadata = { title: "Edit law" };

export default async function SimplifiedLawEditLegislationPage(props: PageProps<"/simplified-law/configuration/legislation/[id]">) {
  if (!(await guardModulePage("simplified-law", PERMISSIONS.SLAW_MANAGE))) return <AccessDenied message="You don't have permission to configure Simplified law." />;
  const { id } = await props.params;
  return (
    <Suspense fallback={<LoadingRows rows={6} />}>
      <EditLegislation id={id} />
    </Suspense>
  );
}
