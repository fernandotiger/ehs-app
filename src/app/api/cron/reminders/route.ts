import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/server/config/env";
import { flagOverdueActions } from "@/server/modules/actions/overdue";
import { runAcknowledgementReminders } from "@/server/modules/documents/acknowledgement-reminders";
import { forEachTenant } from "@/server/tenancy/tenants";

// Reminder jobs page through potentially large populations.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * GET /api/cron/reminders – daily job (see vercel.json; EventBridge Scheduler on AWS).
 * Sends `Authorization: Bearer $CRON_SECRET`. Runs once per active tenant, each inside its own
 * tenant context; a failing tenant does not stop the others.
 */
export async function GET(request: NextRequest) {
  const secret = env().CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Invalid cron secret" } }, { status: 401 });
  }

  const now = new Date();
  const started = Date.now();
  const documents = await forEachTenant(async (org) =>
    org.enabledModules.includes("documents") ? runAcknowledgementReminders(now) : { skipped: "module disabled" },
  );
  // Standalone actions: one "is overdue" notice per action and due date (repeat reminders = Scheduled jobs).
  const actions = await forEachTenant(async (org) => (org.enabledModules.includes("actions") ? flagOverdueActions(now, org.timeZone) : { skipped: "module disabled" }));

  const failed = [...documents, ...actions].filter((r) => r.error);
  const summary = { ranAt: now.toISOString(), durationMs: Date.now() - started, tenants: documents.length, documents, actions };
  if (failed.length) {
    console.error("[cron] reminders failed for some tenants", summary);
    return NextResponse.json(summary, { status: 500 });
  }
  return NextResponse.json(summary);
}
