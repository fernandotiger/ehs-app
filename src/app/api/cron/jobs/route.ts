import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/server/config/env";
import { jobService } from "@/server/modules/jobs/job.service";
import { forEachTenant } from "@/server/tenancy/tenants";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * GET /api/cron/jobs – runs every enabled scheduled job whose local run time has passed today
 * (and has not run successfully on a schedule today), once per tenant.
 * `Authorization: Bearer $CRON_SECRET`. Trigger it as often as you like – it is idempotent per job
 * and local day: Vercel Hobby allows a daily cron (vercel.json); on AWS use EventBridge Scheduler
 * every 15 minutes for near on-time delivery.
 */
export async function GET(request: NextRequest) {
  const secret = env().CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Invalid cron secret" } }, { status: 401 });
  }
  const now = new Date();
  const started = Date.now();
  const tenants = await forEachTenant(() => jobService.runDue(now));
  const failed = tenants.filter((t) => t.error);
  const summary = { ranAt: now.toISOString(), durationMs: Date.now() - started, tenants };
  if (failed.length) {
    console.error("[cron] scheduled jobs failed for some tenants", summary);
    return NextResponse.json(summary, { status: 500 });
  }
  return NextResponse.json(summary);
}
