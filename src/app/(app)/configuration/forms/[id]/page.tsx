import type { Metadata } from "next";
import { AccessDenied } from "@/components/common/access-denied";
import { FormDesigner } from "@/features/forms/components/form-designer";
import { PERMISSIONS } from "@/lib/permissions";
import { guardPage } from "@/server/auth/page-guard";

export const metadata: Metadata = { title: "Form designer" };

export default async function FormDesignerPage(props: { params: Promise<{ id: string }> }) {
  if (!(await guardPage(PERMISSIONS.FORMS_VIEW, PERMISSIONS.FORMS_DESIGN, PERMISSIONS.FORMS_PUBLISH))) return <AccessDenied />;
  const { id } = await props.params;
  return <FormDesigner id={id} />;
}
