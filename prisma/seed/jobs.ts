import type { PrismaClient } from "../../src/generated/prisma/client";
import { SYSTEM_ROLE_KEYS } from "../../src/lib/permissions";
import type { TenantSeed } from "./common";

/**
 * Scheduled jobs for the demo tenant. Idempotent by name (edits made in the app are kept).
 * Risk and Incident targets match nothing until those modules register their due-work providers.
 */
const TARGETS = ["risk.review", "risk.task", "incident.investigation", "incident.action"];

export async function seedJobs(db: PrismaClient, seed: TenantSeed, createdById: string | null): Promise<void> {
  const ehsManager = seed.roles.get(SYSTEM_ROLE_KEYS.EHS_MANAGER);
  if (!ehsManager) throw new Error("EHS Manager role missing");
  const jobs = [
    {
      name: "Daily overdue reminders",
      kind: "OVERDUE" as const,
      targets: TARGETS,
      frequency: "DAILY" as const,
      runTime: "08:00",
      overdueDays: 1,
      recipients: { owners: true, roleIds: [] },
      delivery: "INDIVIDUAL" as const,
      escalation: { afterDays: 7, roleIds: [ehsManager] },
      enabled: true,
    },
    {
      name: "Weekly EHS digest",
      kind: "DIGEST" as const,
      targets: TARGETS,
      frequency: "WEEKLY" as const,
      weekday: 1,
      runTime: "09:00",
      overdueDays: 1,
      recipients: { owners: false, roleIds: [ehsManager] },
      delivery: "DIGEST" as const,
      escalation: null,
      enabled: false,
    },
  ];
  for (const job of jobs) {
    const existing = await db.scheduledJob.findFirst({ where: { organizationId: seed.organizationId, name: job.name }, select: { id: true } });
    if (existing) continue;
    await db.scheduledJob.create({
      data: {
        organizationId: seed.organizationId,
        name: job.name,
        kind: job.kind,
        targets: job.targets,
        scopeType: "COMPANY",
        frequency: job.frequency,
        weekday: "weekday" in job ? job.weekday : null,
        runTime: job.runTime,
        timeZone: "Europe/Dublin",
        overdueDays: job.overdueDays,
        upcomingDays: 7,
        recipients: job.recipients,
        delivery: job.delivery,
        channels: ["IN_APP"],
        escalation: job.escalation ?? undefined,
        enabled: job.enabled,
        createdById,
      },
    });
  }
}
