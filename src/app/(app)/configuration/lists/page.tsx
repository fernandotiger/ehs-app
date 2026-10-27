import type { Metadata } from "next";
import { Suspense } from "react";
import { AccessDenied } from "@/components/common/access-denied";
import { LoadingRows } from "@/components/common/states";
import { ListsPage } from "@/features/configuration/components/lists-page";
import { PERMISSIONS } from "@/lib/permissions";
import { guardPage } from "@/server/auth/page-guard";

export const metadata: Metadata = { title: "Lists & categories" };

export default async function ConfigurationListsPageRoute() {
  if (!(await guardPage(PERMISSIONS.CONFIG_LISTS))) return <AccessDenied />;
  return (
    <Suspense fallback={<LoadingRows rows={8} />}>
      <ListsPage />
    </Suspense>
  );
}
