import type { Metadata } from "next";
import { Suspense } from "react";
import { AccessDenied } from "@/components/common/access-denied";
import { LoadingCards } from "@/components/common/states";
import { CreateActionForm } from "@/features/actions/components/action-form";
import { PERMISSIONS } from "@/lib/permissions";
import { guardModulePage } from "@/server/auth/page-guard";

export const metadata: Metadata = { title: "Create action" };

export default async function CreateActionPage() {
  if (!(await guardModulePage("actions", PERMISSIONS.ACTION_CREATE))) return <AccessDenied message="You don't have permission to create actions." />;
  // The form reads `?fav=` (a favourite's kept values), so it sits in its own Suspense boundary.
  return (
    <Suspense fallback={<LoadingCards count={2} />}>
      <CreateActionForm />
    </Suspense>
  );
}
