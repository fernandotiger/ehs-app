import "server-only";
import { prisma } from "@/server/db/client";
import { localDate } from "@/server/modules/jobs/engine";
import { notificationService } from "@/server/modules/notifications/notification.service";
import { ACTION_ENTITY, actionHref, dateOnly, toDate } from "./support";

/**
 * Overdue check for standalone actions (daily cron `/api/cron/reminders`, once per tenant inside its
 * tenant context). Each owner gets ONE "is overdue" notice per action and due date – the dedupe key
 * contains the due date, so moving the due date and missing it again notifies once more. Repeated
 * reminders, escalation and digests come from Scheduled jobs targeting "Actions".
 */

const BATCH = 500;

export async function flagOverdueActions(now: Date, timeZone: string): Promise<{ overdue: number; notified: number }> {
  const today = toDate(localDate(now, timeZone));
  let overdue = 0;
  let notified = 0;
  let cursor: string | undefined;
  for (;;) {
    const rows = await prisma.action.findMany({
      where: { status: { in: ["OPEN", "IN_PROGRESS"] }, archivedAt: null, dueDate: { lt: today } },
      select: { id: true, reference: true, title: true, ownerId: true, dueDate: true },
      orderBy: { id: "asc" },
      take: BATCH,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    if (!rows.length) break;
    for (const a of rows) {
      overdue += 1;
      const due = dateOnly(a.dueDate)!;
      notified += await notificationService.notify({
        userIds: [a.ownerId],
        type: "action.overdue",
        title: `${a.reference} is overdue`,
        body: `${a.title} · was due ${due}`,
        link: actionHref(a.id),
        entityType: ACTION_ENTITY,
        entityId: a.id,
        dedupeKey: `action.overdue:${a.id}:${due}`,
      });
    }
    if (rows.length < BATCH) break;
    cursor = rows[rows.length - 1]!.id;
  }
  return { overdue, notified };
}
