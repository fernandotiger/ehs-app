import "server-only";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/server/db/client";
import { notificationService } from "@/server/modules/notifications/notification.service";
import { settingsService } from "@/server/modules/settings/settings.service";
import { requireTenantId } from "@/server/tenancy/context";
import { decideReminder, dueDateFor, reminderWindowCreatedBefore } from "./acknowledgement-rules";
import { DOCUMENT_ENTITY, DOCUMENT_NOTIFICATIONS } from "./document-audit-actions";
import { buildRequirement, documentLink, requirementSelect, type Requirement, type RequirementDocument } from "./document-requirement";

/**
 * Scheduled acknowledgement reminders & escalation (in-app notifications).
 * Runs once per tenant (the cron route wraps it in forEachTenant, so every query is scoped);
 * safe to run repeatedly – `AcknowledgementReminder` rows record what was sent per
 * (document, user, required version).
 */

const DOC_BATCH = 50;
const USER_BATCH = 500;

interface RunTotals {
  remindersSent: number;
  escalations: number;
}

interface Escalation {
  userId: string;
  name: string;
  managerId: string | null;
}

async function hrRecipients(): Promise<string[]> {
  const rows = await prisma.user.findMany({
    where: { isActive: true, roleAssignments: { some: { role: { permissions: { has: PERMISSIONS.DOCUMENTS_MANAGE } } } } },
    select: { id: true },
    take: 200,
  });
  return rows.map((r) => r.id);
}

function namesPreview(names: string[]): string {
  const shown = names.slice(0, 3).join(", ");
  return names.length > 3 ? `${shown} and ${names.length - 3} more` : shown;
}

/** Send escalation notifications for one batch: grouped per manager, or one summary to HR. */
async function sendEscalations(doc: RequirementDocument, req: Requirement, escalations: Escalation[], getHr: () => Promise<string[]>) {
  if (!escalations.length) return;
  const base = { type: DOCUMENT_NOTIFICATIONS.ACK_ESCALATION, link: documentLink(doc.id), entityType: DOCUMENT_ENTITY, entityId: doc.id };
  const toHr: Escalation[] = [];

  if (req.settings.escalationTarget === "MANAGER") {
    const byManager = new Map<string, Escalation[]>();
    for (const e of escalations) {
      if (!e.managerId) toHr.push(e);
      else byManager.set(e.managerId, [...(byManager.get(e.managerId) ?? []), e]);
    }
    for (const [managerId, team] of byManager) {
      await notificationService.notify({
        userIds: [managerId],
        ...base,
        title: `Overdue acknowledgement: ${doc.title}`,
        body: `${namesPreview(team.map((t) => t.name))} ${team.length === 1 ? "has" : "have"} not acknowledged this document and ${team.length === 1 ? "is" : "are"} overdue.`,
      });
    }
  } else {
    toHr.push(...escalations);
  }

  if (toHr.length) {
    const hr = await getHr();
    await notificationService.notify({
      userIds: hr,
      ...base,
      title: `Overdue acknowledgements: ${doc.title}`,
      body: `${toHr.length} ${toHr.length === 1 ? "person is" : "people are"} overdue: ${namesPreview(toHr.map((t) => t.name))}.`,
    });
  }
}

async function processDocument(doc: RequirementDocument, req: Requirement, now: Date, getHr: () => Promise<string[]>, organizationId: string): Promise<RunTotals> {
  const totals: RunTotals = { remindersSent: 0, escalations: 0 };
  const createdBefore = reminderWindowCreatedBefore(req.since, req.settings.ackDueDays, now);
  if (!createdBefore || !req.since) return totals;

  const where = { AND: [req.population, req.outstanding, { createdAt: { lte: createdBefore } }] };
  let cursor: string | undefined;

  for (;;) {
    const users = await prisma.user.findMany({
      where,
      select: {
        id: true,
        name: true,
        createdAt: true,
        managerId: true,
        acknowledgementReminders: {
          where: { documentId: doc.id, versionNumber: req.fromVersion },
          select: { remindersSent: true, lastRemindedAt: true, escalatedAt: true },
          take: 1,
        },
      },
      orderBy: { id: "asc" },
      take: USER_BATCH,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (!users.length) break;
    cursor = users[users.length - 1]!.id;

    const remind: { id: string; dueAt: Date }[] = [];
    const escalate: Escalation[] = [];
    for (const u of users) {
      const dueAt = dueDateFor(req.since, u.createdAt, req.settings.ackDueDays);
      const decision = decideReminder({ now, dueAt, settings: req.settings, state: u.acknowledgementReminders[0] ?? null });
      if (decision.remind) remind.push({ id: u.id, dueAt });
      if (decision.escalate) escalate.push({ userId: u.id, name: u.name, managerId: u.managerId });
    }

    const touched = [...new Set([...remind.map((r) => r.id), ...escalate.map((e) => e.userId)])];
    if (touched.length) {
      await prisma.acknowledgementReminder.createMany({
        data: touched.map((userId) => ({ organizationId, documentId: doc.id, userId, versionNumber: req.fromVersion })),
        skipDuplicates: true,
      });
    }
    const bookkeeping = { documentId: doc.id, versionNumber: req.fromVersion };
    if (remind.length) {
      await prisma.acknowledgementReminder.updateMany({
        where: { ...bookkeeping, userId: { in: remind.map((r) => r.id) } },
        data: { remindersSent: { increment: 1 }, lastRemindedAt: now },
      });
      const overdueIds = remind.filter((r) => r.dueAt.getTime() < now.getTime()).map((r) => r.id);
      const dueSoonIds = remind.filter((r) => r.dueAt.getTime() >= now.getTime()).map((r) => r.id);
      const base = { type: DOCUMENT_NOTIFICATIONS.ACK_REMINDER, link: documentLink(doc.id), entityType: DOCUMENT_ENTITY, entityId: doc.id };
      if (dueSoonIds.length) {
        await notificationService.notify({ ...base, userIds: dueSoonIds, title: `Reminder: please acknowledge ${doc.title}`, body: "Your acknowledgement is due soon." });
      }
      if (overdueIds.length) {
        await notificationService.notify({
          ...base,
          userIds: overdueIds,
          title: `Overdue: please acknowledge ${doc.title}`,
          body: "Your acknowledgement is overdue. Please read and confirm the document as soon as possible.",
        });
      }
      totals.remindersSent += remind.length;
    }
    if (escalate.length) {
      await prisma.acknowledgementReminder.updateMany({
        where: { ...bookkeeping, userId: { in: escalate.map((e) => e.userId) }, escalatedAt: null },
        data: { escalatedAt: now },
      });
      await sendEscalations(doc, req, escalate, getHr);
      totals.escalations += escalate.length;
    }
    if (users.length < USER_BATCH) break;
  }
  return totals;
}

/**
 * Runs one reminder/escalation pass over every published document that requires
 * acknowledgement. Documents and users are processed in keyset-paginated batches.
 */
export async function runAcknowledgementReminders(now: Date): Promise<{ remindersSent: number; escalations: number }> {
  const organizationId = requireTenantId();
  const defaults = await settingsService.get("system");
  const totals: RunTotals = { remindersSent: 0, escalations: 0 };
  let hrCache: string[] | null = null;
  const getHr = async () => (hrCache ??= await hrRecipients());

  let cursor: string | undefined;
  for (;;) {
    const docs = await prisma.document.findMany({
      where: { status: "PUBLISHED", requiresAcknowledgement: true, publishedAt: { lte: now } },
      select: requirementSelect,
      orderBy: { id: "asc" },
      take: DOC_BATCH,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (!docs.length) break;
    cursor = docs[docs.length - 1]!.id;

    for (const doc of docs) {
      try {
        const result = await processDocument(doc, buildRequirement(doc, defaults), now, getHr, organizationId);
        totals.remindersSent += result.remindersSent;
        totals.escalations += result.escalations;
      } catch (error) {
        // One broken document must not stop reminders for the rest.
        console.error("[documents] reminder run failed for document", doc.id, error);
      }
    }
    if (docs.length < DOC_BATCH) break;
  }
  return totals;
}
