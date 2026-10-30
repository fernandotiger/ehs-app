import type { Metadata } from "next";
import { Suspense } from "react";
import { AccessDenied } from "@/components/common/access-denied";
import { LoadingRows } from "@/components/common/states";
import { AssistantSettingsPage } from "@/features/assistant/components/assistant-settings-page";
import { PERMISSIONS } from "@/lib/permissions";
import { guardPage } from "@/server/auth/page-guard";

export const metadata: Metadata = { title: "AI assistant" };

export default async function ConfigurationAssistantPageRoute() {
  if (!(await guardPage(PERMISSIONS.ADMIN_SETTINGS))) return <AccessDenied />;
  return (
    <Suspense fallback={<LoadingRows rows={8} />}>
      <AssistantSettingsPage />
    </Suspense>
  );
}
