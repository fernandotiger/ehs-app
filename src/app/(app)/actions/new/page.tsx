import type { Metadata } from "next";
import { AccessDenied } from "@/components/common/access-denied";
import { CreateActionForm } from "@/features/actions/components/action-form";
import { PERMISSIONS } from "@/lib/permissions";
import { guardModulePage } from "@/server/auth/page-guard";

export const metadata: Metadata = { title: "Create action" };

export default async function CreateActionPage() {
  if (!(await guardModulePage("actions", PERMISSIONS.ACTION_CREATE))) return <AccessDenied message="You don't have permission to create actions." />;
  return <CreateActionForm />;
}
