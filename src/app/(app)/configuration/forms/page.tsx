import type { Metadata } from "next";
import { Suspense } from "react";
import { AccessDenied } from "@/components/common/access-denied";
import { LoadingRows } from "@/components/common/states";
import { FormsLibrary } from "@/features/forms/components/forms-library";
import { PERMISSIONS } from "@/lib/permissions";
import { guardPage } from "@/server/auth/page-guard";

export const metadata: Metadata = { title: "Form Builder" };

export default async function FormBuilderPage() {
  if (!(await guardPage(PERMISSIONS.FORMS_VIEW, PERMISSIONS.FORMS_DESIGN, PERMISSIONS.FORMS_PUBLISH))) return <AccessDenied />;
  return (
    <Suspense fallback={<LoadingRows rows={8} />}>
      <FormsLibrary />
    </Suspense>
  );
}
