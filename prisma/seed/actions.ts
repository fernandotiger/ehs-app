import type { Prisma, PrismaClient } from "../../src/generated/prisma/client";
import { ACTION_FORM_MODULE, ACTION_FORM_PURPOSE } from "../../src/lib/actions";
import type { FormFieldDefinition } from "../../src/lib/forms/types";
import { auditRow } from "./common";
import { publishSeedForm } from "./forms";

/**
 * Standalone actions demo data for Northstar (Actions module). Idempotent: the "Action details"
 * form is published when missing, the scheduled overdue job gets the "action" target when missing,
 * and actions are only created when the tenant has none yet. Dates are relative to today, so some
 * actions are overdue or due this week whenever the seed runs.
 *
 * Existing databases: `bash scripts/localdb.sh npm run db:seed:actions` (local only by default).
 */

const DAY = 86_400_000;
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

function day(offset: number): Date {
  const d = new Date(Date.now() + offset * DAY);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

const DETAILS_FORM_NAME = "Action details";

const DETAILS_FIELDS: FormFieldDefinition[] = [
  {
    key: "actionCategory",
    label: "What kind of action is it?",
    type: "select",
    required: true,
    options: ["Repair or maintenance", "Housekeeping", "Training", "Paperwork or procedure", "Purchase", "Other"].map((label) => ({ value: label.toLowerCase().replace(/[^a-z]+/g, "-"), label })),
  },
  { key: "estimatedCost", label: "Estimated cost (€)", type: "number", min: 0, helpText: "Leave empty when there is no cost." },
  { key: "permitNeeded", label: "Is a work permit needed?", type: "boolean" },
];

interface ActionSpec {
  title: string;
  description: string;
  owner: string;
  createdBy: string;
  department: string | null;
  priority: "LOW" | "NORMAL" | "HIGH" | "URGENT";
  createdDaysAgo: number;
  dueInDays: number;
  status: "OPEN" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
  startedDaysAgo?: number;
  completed?: { daysAgo: number; notes: string; by?: string };
  cancelled?: { daysAgo: number; reason: string };
  answers?: Record<string, unknown>;
}

const ACTIONS: ActionSpec[] = [
  {
    title: "Replace the broken step on the loading bay ladder",
    description: "Second step from the top is cracked. Tag the ladder out of use until it is replaced.",
    owner: "john@northstar.example",
    createdBy: "sarah@northstar.example",
    department: "Third Parties",
    priority: "HIGH",
    createdDaysAgo: 12,
    dueInDays: -3,
    status: "OPEN",
    answers: { actionCategory: "repair-or-maintenance", estimatedCost: 80, permitNeeded: false },
  },
  {
    title: "Book first aid refresher training for the night shift",
    description: "Three first aiders' certificates expire next month.",
    owner: "emma@northstar.example",
    createdBy: "admin@northstar.example",
    department: "Whole Site",
    priority: "NORMAL",
    createdDaysAgo: 6,
    dueInDays: 4,
    status: "IN_PROGRESS",
    startedDaysAgo: 2,
    answers: { actionCategory: "training", estimatedCost: 450, permitNeeded: false },
  },
  {
    title: "Clear the blocked fire exit route behind the packing line",
    description: "Pallets stored in front of fire door FD-12.",
    owner: "sam@northstar.example",
    createdBy: "priya@northstar.example",
    department: "Operations",
    priority: "URGENT",
    createdDaysAgo: 3,
    dueInDays: -1,
    status: "IN_PROGRESS",
    startedDaysAgo: 2,
  },
  {
    title: "Update the visitor sign-in sheet with the new site rules",
    description: "",
    owner: "helen@northstar.example",
    createdBy: "helen@northstar.example",
    department: null,
    priority: "LOW",
    createdDaysAgo: 2,
    dueInDays: 21,
    status: "OPEN",
  },
  {
    title: "Order replacement ear defenders for the press area",
    description: "Stock is down to 4 pairs.",
    owner: "priya@northstar.example",
    createdBy: "sam@northstar.example",
    department: "Engineering",
    priority: "NORMAL",
    createdDaysAgo: 20,
    dueInDays: -10,
    status: "COMPLETED",
    completed: { daysAgo: 12, notes: "20 pairs ordered and delivered to the press area store." },
    answers: { actionCategory: "purchase", estimatedCost: 260, permitNeeded: false },
  },
  {
    title: "Fix the flickering light in the warehouse office",
    description: "",
    owner: "liam@northstar.example",
    createdBy: "john@northstar.example",
    department: "Third Parties",
    priority: "LOW",
    createdDaysAgo: 15,
    dueInDays: -5,
    status: "CANCELLED",
    cancelled: { daysAgo: 9, reason: "Duplicate – the building contractor is replacing all office lighting." },
  },
  {
    title: "Review the chemical store inventory against the safety data sheets",
    description: "Check every product has a current SDS in the binder.",
    owner: "liam@northstar.example",
    createdBy: "emma@northstar.example",
    department: "Third Parties",
    priority: "HIGH",
    createdDaysAgo: 1,
    dueInDays: 6,
    status: "OPEN",
  },
];

export async function applyDemoActions(db: PrismaClient, organizationId: string): Promise<{ form: boolean; job: boolean; actions: number }> {
  const users = new Map((await db.user.findMany({ where: { organizationId }, select: { id: true, email: true, name: true } })).map((u) => [u.email, u]));
  const admin = users.get("admin@northstar.example") ?? null;
  const form = await publishSeedForm(
    db,
    organizationId,
    { name: DETAILS_FORM_NAME, module: ACTION_FORM_MODULE, purpose: ACTION_FORM_PURPOSE, fields: DETAILS_FIELDS, settings: {} },
    admin ? { id: admin.id, name: admin.name } : null,
  );

  // The demo overdue reminder job also checks standalone actions.
  const job = await db.scheduledJob.findFirst({ where: { organizationId, name: "Daily overdue reminders" }, select: { id: true, targets: true } });
  const addTarget = Boolean(job && !job.targets.includes("action"));
  if (job && addTarget) await db.scheduledJob.update({ where: { id: job.id }, data: { targets: [...job.targets, "action"] } });

  if ((await db.action.count({ where: { organizationId } })) > 0) return { form: form.created, job: addTarget, actions: 0 };

  const definition = await db.formDefinition.findUnique({ where: { id: form.id }, select: { currentVersionId: true } });
  const version = definition?.currentVersionId ? await db.formVersion.findUnique({ where: { id: definition.currentVersionId } }) : null;
  const departments = await db.department.findMany({ where: { organizationId } });
  const user = (email: string) => {
    const u = users.get(email);
    if (!u) throw new Error(`Seed user ${email} missing`);
    return u;
  };
  const year = new Date().getUTCFullYear();
  let n = 0;
  const audit: Prisma.AuditLogCreateManyInput[] = [];

  for (const spec of ACTIONS) {
    n += 1;
    const reference = `AC-${year}-${String(n).padStart(4, "0")}`;
    const owner = user(spec.owner);
    const creator = user(spec.createdBy);
    const dept = spec.department ? departments.find((d) => d.name === spec.department) : null;
    if (spec.department && !dept) throw new Error(`Department ${spec.department} missing`);
    const createdAt = new Date(day(-spec.createdDaysAgo).getTime() + 9 * 3_600_000);
    const snapshot =
      spec.answers && version
        ? { formId: version.formId, versionId: version.id, version: version.version, name: version.name, module: version.module, purpose: version.purpose, siteId: dept?.siteId ?? null, fields: version.fields, settings: version.settings ?? {}, capturedAt: createdAt.toISOString() }
        : null;
    const completedBy = spec.completed ? user(spec.completed.by ?? spec.owner) : null;
    const row = await db.action.create({
      data: {
        organizationId,
        reference,
        title: spec.title,
        description: spec.description,
        priority: spec.priority,
        status: spec.status,
        ownerId: owner.id,
        createdById: creator.id,
        dueDate: day(spec.dueInDays),
        startedAt: spec.startedDaysAgo !== undefined ? day(-spec.startedDaysAgo) : null,
        completedOn: spec.completed ? day(-spec.completed.daysAgo) : null,
        completedAt: spec.completed ? day(-spec.completed.daysAgo) : null,
        completedById: completedBy?.id ?? null,
        completionNotes: spec.completed?.notes ?? null,
        cancelledAt: spec.cancelled ? day(-spec.cancelled.daysAgo) : null,
        cancelledById: spec.cancelled ? creator.id : null,
        cancelReason: spec.cancelled?.reason ?? null,
        businessUnitId: dept?.businessUnitId ?? null,
        siteId: dept?.siteId ?? null,
        locationId: dept?.locationId ?? null,
        departmentId: dept?.id ?? null,
        formId: snapshot?.formId ?? null,
        formVersionId: snapshot?.versionId ?? null,
        form: snapshot ? json(snapshot) : undefined,
        answers: snapshot ? json(spec.answers) : undefined,
        createdAt,
      },
      select: { id: true },
    });
    const actor = (u: { id: string; name: string }) => ({ id: u.id, name: u.name });
    audit.push(
      auditRow(organizationId, {
        entityType: "Action",
        entityId: row.id,
        action: "ACTION_CREATED",
        actor: actor(creator),
        changes: { reference, title: spec.title, ownerId: owner.id, dueDate: day(spec.dueInDays).toISOString().slice(0, 10), priority: spec.priority, departmentId: dept?.id ?? null },
        metadata: snapshot ? { form: snapshot.name, formVersion: snapshot.version } : undefined,
        createdAt,
      }),
    );
    if (spec.startedDaysAgo !== undefined) audit.push(auditRow(organizationId, { entityType: "Action", entityId: row.id, action: "ACTION_STARTED", actor: actor(owner), createdAt: day(-spec.startedDaysAgo) }));
    if (spec.completed && completedBy) {
      audit.push(
        auditRow(organizationId, {
          entityType: "Action",
          entityId: row.id,
          action: "ACTION_COMPLETED",
          actor: actor(completedBy),
          changes: { completedOn: day(-spec.completed.daysAgo).toISOString().slice(0, 10), ownerId: owner.id },
          metadata: { notes: spec.completed.notes },
          createdAt: day(-spec.completed.daysAgo),
        }),
      );
    }
    if (spec.cancelled) {
      audit.push(auditRow(organizationId, { entityType: "Action", entityId: row.id, action: "ACTION_CANCELLED", actor: actor(creator), metadata: { reason: spec.cancelled.reason }, createdAt: day(-spec.cancelled.daysAgo) }));
    }
  }
  await db.auditLog.createMany({ data: audit });
  const key = `action:${year}`;
  await db.counter.upsert({ where: { organizationId_key: { organizationId, key } }, create: { organizationId, key, value: n }, update: { value: n } });
  return { form: form.created, job: addTarget, actions: n };
}
