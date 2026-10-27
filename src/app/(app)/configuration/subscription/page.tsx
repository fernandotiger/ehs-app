import type { Metadata } from "next";
import { Suspense } from "react";
import { AccessDenied } from "@/components/common/access-denied";
import { LoadingRows } from "@/components/common/states";
import { SubscriptionPage } from "@/features/configuration/components/subscription-page";
import { PERMISSIONS } from "@/lib/permissions";
import { guardPage } from "@/server/auth/page-guard";

export const metadata: Metadata = { title: "Subscription" };

export default async function ConfigurationSubscriptionPageRoute() {
  if (!(await guardPage(PERMISSIONS.CONFIG_SUBSCRIPTION))) return <AccessDenied />;
  return (
    <Suspense fallback={<LoadingRows rows={8} />}>
      <SubscriptionPage />
    </Suspense>
  );
}
