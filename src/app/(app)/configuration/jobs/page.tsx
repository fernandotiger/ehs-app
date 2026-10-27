import type { Metadata } from "next";
import { Suspense } from "react";
import { AccessDenied } from "@/components/common/access-denied";
import { LoadingRows } from "@/components/common/states";
import { JobsPage } from "@/features/jobs/components/jobs-page";
import { PERMISSIONS } from "@/lib/permissions";
import { guardPage } from "@/server/auth/page-guard";

export const metadata: Metadata = { title: "Scheduled jobs" };

export default async function ScheduledJobsPage() {
  if (!(await guardPage(PERMISSIONS.CONFIG_JOBS_VIEW, PERMISSIONS.CONFIG_JOBS_MANAGE, PERMISSIONS.CONFIG_JOBS_TEST))) return <AccessDenied />;
  return (
    <Suspense fallback={<LoadingRows rows={8} />}>
      <JobsPage />
    </Suspense>
  );
}
