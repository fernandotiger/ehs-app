import type { Prisma, PrismaClient } from "../../src/generated/prisma/client";
import { validatePackage } from "../../src/lib/law";
import { initialLawPackage } from "../../src/lib/law/sample-content";
import { defaultNumberFormat, formatReference } from "../../src/lib/settings/numbering";
import { ensureNonComplianceType } from "../../src/server/modules/law/incident-type";
import { syncProfileRequirements } from "../../src/server/modules/law/requirement-sync";
import { auditRow } from "./common";

/**
 * Law demo data for Northstar. Idempotent:
 *  - the fictional legal content 2026.Q3 is installed when the tenant has no library yet
 *    (the 2026.Q4 sample update is left for Configuration → Law content & settings);
 *  - the "Non Compliance" incident type Law raises drafts with is set up / switched on;
 *  - the daily overdue job gets the `law.evaluation` and `law.task` targets;
 *  - profiles, evaluations, tasks and links are only created when the tenant has no profile yet.
 * Dates are relative to today, so some reviews and tasks are always overdue or due soon.
 *
 * Existing databases: `bash scripts/localdb.sh npm run db:seed:law` (local only by default).
 */

const DAY = 86_400_000;
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

function day(offset: number): Date {
  const d = new Date(Date.now() + offset * DAY);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

interface EvaluationSpec {
  relevance?: string;
  evaluation?: string;
  rating?: number;
  owner?: string;
  department?: string;
  reviewInDays?: number;
  evaluatedDaysAgo?: number;
  notRelevant?: string;
}

interface ProfileSpec {
  name: string;
  site: string;
  owner: string;
  activities: string[];
  description: string;
  evaluations: Record<string, EvaluationSpec>;
  tasks: { checklist: string; title: string; details: string; owner: string; department: string; dueInDays: number; priority: "LOW" | "MEDIUM" | "HIGH"; completed?: { daysAgo: number; notes: string } }[];
  links: { checklist: string; kind: "RiskAssessment" | "Incident"; context: string }[];
  other?: { title: string; text: string; category: string; keywords: string[] };
}

const PROFILES: ProfileSpec[] = [
  {
    name: "Dublin Plant – operations",
    site: "Dublin Plant",
    owner: "sam@northstar.example",
    activities: ["Workplace operations", "Workplace transport", "Machinery", "Chemicals", "Waste", "Air emissions"],
    description: "Production floor with fixed machinery, forklifts, a maintenance chemical store and segregated waste streams.",
    evaluations: {
      "CL-001": {
        relevance: "Forklifts operate on the production floor; the EHS team owns the traffic plan and the floor markings.",
        evaluation: "Routes checked during the September inspection. Physical separation improvements at the dispatch door remain open.",
        rating: 65,
        owner: "sam@northstar.example",
        department: "Operations",
        reviewInDays: 60,
        evaluatedDaysAgo: 40,
      },
      "CL-002": {
        relevance: "Maintenance inspects all fixed machinery and owns the guarding register.",
        evaluation: "Monthly inspection records reviewed; guards present on all sampled equipment.",
        rating: 90,
        owner: "priya@northstar.example",
        department: "Engineering",
        reviewInDays: -5,
        evaluatedDaysAgo: 370,
      },
      "CL-003": {
        relevance: "Chemicals and hydraulic oils are stored in the maintenance area.",
        owner: "priya@northstar.example",
        department: "Engineering",
      },
      "CL-004": {
        relevance: "Waste streams are segregated on site and collected by approved contractors.",
        evaluation: "Transfer records and the contractor review were sampled in September – all in order.",
        rating: 85,
        owner: "sam@northstar.example",
        department: "Whole Site",
        reviewInDays: 120,
        evaluatedDaysAgo: 30,
      },
    },
    tasks: [
      {
        checklist: "CL-003",
        title: "Review chemical containment inspection records",
        details: "Include the hydraulic oil spill investigation findings.",
        owner: "priya@northstar.example",
        department: "Engineering",
        dueInDays: -3,
        priority: "MEDIUM",
      },
      {
        checklist: "CL-001",
        title: "Repaint the pedestrian walkway at the dispatch door",
        details: "The yellow walkway lines are worn near dispatch door 2.",
        owner: "sam@northstar.example",
        department: "Operations",
        dueInDays: -2,
        priority: "HIGH",
        completed: { daysAgo: 10, notes: "Walkway repainted and barrier post added; photos on the evidence tab." },
      },
    ],
    links: [{ checklist: "CL-002", kind: "RiskAssessment", context: "Machine guarding hazard" }],
  },
  {
    name: "Cork Distribution – warehouse",
    site: "Cork Distribution",
    owner: "emma@northstar.example",
    activities: ["Workplace operations", "Workplace transport", "Waste"],
    description: "Warehouse and loading bays shared by forklifts, delivery drivers and pedestrians.",
    evaluations: {
      "CL-001": {
        relevance: "Forklift movements share the loading bay with pedestrians and visiting drivers.",
        evaluation: "Near misses identified a segregation gap at bay 3. A corrective action is still being verified.",
        rating: 45,
        owner: "sarah@northstar.example",
        department: "Third Parties",
        reviewInDays: 30,
        evaluatedDaysAgo: 20,
      },
      "CL-006": { notRelevant: "Emergency arrangements are assessed under the shared corporate programme for this demo." },
    },
    tasks: [
      {
        checklist: "CL-001",
        title: "Walk the pedestrian route on each shift and photograph the barriers",
        details: "Compare the traffic plan with the routes people actually use and add the photos as evidence.",
        owner: "john@northstar.example",
        department: "Third Parties",
        dueInDays: 5,
        priority: "HIGH",
      },
    ],
    links: [
      { checklist: "CL-001", kind: "RiskAssessment", context: "Moving vehicles · pedestrian segregation" },
      { checklist: "CL-001", kind: "Incident", context: "Near miss at the loading bay" },
    ],
    other: { title: "Customer safety briefing commitment", text: "Brief every visiting contractor and delivery driver before they enter the warehouse.", category: "Customer requirement", keywords: ["contractors", "induction", "visitors"] },
  },
];

export async function applyDemoLaw(db: PrismaClient, organizationId: string) {
  const result = { library: false, incidentType: [] as string[], job: false, profiles: 0, requirements: 0, tasks: 0, links: 0 };
  const year = new Date().getUTCFullYear();

  // 1. Legal content library 2026.Q3.
  let library = await db.lawContentVersion.findFirst({ where: { organizationId }, orderBy: { rank: "desc" } });
  if (!library) {
    const check = validatePackage(initialLawPackage(), null);
    if (!check.ok) throw new Error(`Demo legal content is invalid: ${check.problems.join(" ")}`);
    library = await db.lawContentVersion.create({
      data: { organizationId, version: check.pkg.version, rank: check.rank, releasedOn: new Date(`${check.pkg.released}T00:00:00.000Z`), summary: check.pkg.summary, content: json(check.next), changes: json(check.changes) },
    });
    result.library = true;
  }

  // 2. Non Compliance incident type (Law follow-ups).
  result.incidentType = (await ensureNonComplianceType(db, organizationId)).changes;

  // 3. Reminders: law targets on the daily overdue job.
  const job = await db.scheduledJob.findFirst({ where: { organizationId, name: "Daily overdue reminders" }, select: { id: true, targets: true } });
  const missingTargets = ["law.evaluation", "law.task"].filter((t) => job && !job.targets.includes(t));
  if (job && missingTargets.length) {
    await db.scheduledJob.update({ where: { id: job.id }, data: { targets: [...job.targets, ...missingTargets] } });
    result.job = true;
  }

  // 4. Profiles and their work – only on a tenant without profiles.
  if (await db.lawProfile.count({ where: { organizationId } })) return result;
  const content = library.content as unknown as Parameters<typeof syncProfileRequirements>[1]["content"];
  const users = new Map((await db.user.findMany({ where: { organizationId }, select: { id: true, email: true, name: true } })).map((u) => [u.email, u]));
  const sites = new Map((await db.site.findMany({ where: { organizationId }, select: { id: true, name: true, businessUnitId: true } })).map((s) => [s.name, s]));
  const departments = await db.department.findMany({ where: { organizationId }, select: { id: true, name: true, siteId: true, locationId: true, businessUnitId: true } });
  const admin = users.get("admin@northstar.example") ?? null;
  const actor = (email: string | null) => (email ? (users.get(email) ?? admin) : admin);

  const levCounter = await db.counter.findUnique({ where: { organizationId_key: { organizationId, key: `legal-evaluation:${year}` } } });
  const taskCounter = await db.counter.findUnique({ where: { organizationId_key: { organizationId, key: `law-task:${year}` } } });
  let lev = levCounter?.value ?? 0;
  let lt = taskCounter?.value ?? 0;
  const nextLev = async () => formatReference(defaultNumberFormat("legal-evaluation"), year, ++lev);
  const audit: Prisma.AuditLogCreateManyInput[] = [];

  for (const spec of PROFILES) {
    const site = sites.get(spec.site);
    const owner = users.get(spec.owner);
    if (!site || !owner) continue;
    const profile = await db.lawProfile.create({
      data: {
        organizationId,
        name: spec.name,
        description: spec.description,
        ownerId: owner.id,
        jurisdiction: "Ireland",
        activities: spec.activities,
        contentVersion: library.version,
        businessUnitId: site.businessUnitId,
        siteId: site.id,
        createdById: admin?.id ?? owner.id,
        createdAt: day(-90),
      },
    });
    result.profiles++;
    audit.push(auditRow(organizationId, { entityType: "LawProfile", entityId: profile.id, action: "LAW_PROFILE_CREATED", actor: admin, changes: { name: spec.name, jurisdiction: "Ireland", activities: spec.activities, contentVersion: library.version }, createdAt: day(-90) }));
    const { created } = await syncProfileRequirements(db, {
      organizationId,
      profile: { id: profile.id, jurisdiction: "Ireland", activities: spec.activities, businessUnitId: site.businessUnitId, siteId: site.id },
      content,
      nextReference: nextLev,
      actorId: admin?.id ?? null,
    });
    result.requirements += created.length;
    const rows = await db.lawRequirement.findMany({ where: { profileId: profile.id }, select: { id: true, contentKey: true } });
    const byKey = new Map(rows.map((r) => [r.contentKey, r.id]));

    for (const [key, e] of Object.entries(spec.evaluations)) {
      const id = byKey.get(key);
      if (!id) continue;
      const dept = e.department ? departments.find((d) => d.name === e.department && d.siteId === site.id) : undefined;
      const ownerId = e.owner ? (users.get(e.owner)?.id ?? null) : null;
      const placement = dept ? { businessUnitId: dept.businessUnitId, siteId: dept.siteId, locationId: dept.locationId, departmentId: dept.id } : {};
      await db.lawRequirement.update({
        where: { id },
        data: {
          relevanceNotes: e.relevance ?? "",
          evaluationNotes: e.evaluation ?? "",
          rating: e.rating ?? null,
          ownerId,
          nextReviewDate: e.reviewInDays === undefined ? null : day(e.reviewInDays),
          evaluatedOn: e.evaluatedDaysAgo === undefined ? null : day(-e.evaluatedDaysAgo),
          isRelevant: !e.notRelevant,
          exclusionReason: e.notRelevant ?? null,
          ...placement,
        },
      });
      const when = day(-(e.evaluatedDaysAgo ?? 15));
      if (e.notRelevant) {
        audit.push(auditRow(organizationId, { entityType: "LawRequirement", entityId: id, action: "LAW_REQUIREMENT_EXCLUDED", actor: actor(spec.owner), changes: { isRelevant: { from: true, to: false } }, metadata: { reason: e.notRelevant }, createdAt: when }));
      } else {
        audit.push(
          auditRow(organizationId, {
            entityType: "LawRequirement",
            entityId: id,
            action: "LAW_EVALUATION_SAVED",
            actor: actor(e.owner ?? spec.owner),
            changes: { relevanceNotes: { from: "", to: e.relevance ?? "" }, ...(e.evaluation ? { evaluationNotes: { from: "", to: e.evaluation } } : {}), ...(e.rating !== undefined ? { rating: { from: null, to: e.rating } } : {}) },
            metadata: { status: e.evaluation ? "complete" : "partial" },
            createdAt: when,
          }),
        );
      }
    }

    if (spec.other) {
      const reference = await nextLev();
      const row = await db.lawRequirement.create({
        data: {
          organizationId,
          profileId: profile.id,
          reference,
          kind: "OTHER",
          title: spec.other.title,
          register: "Other requirements",
          category: spec.other.category,
          requirementText: spec.other.text,
          keywords: spec.other.keywords,
          businessUnitId: site.businessUnitId,
          siteId: site.id,
          createdById: owner.id,
        },
      });
      result.requirements++;
      audit.push(auditRow(organizationId, { entityType: "LawRequirement", entityId: row.id, action: "LAW_REQUIREMENT_ADDED", actor: owner, changes: { reference, title: spec.other.title }, createdAt: day(-25) }));
    }

    for (const t of spec.tasks) {
      const requirementId = byKey.get(t.checklist);
      const taskOwner = users.get(t.owner);
      const dept = departments.find((d) => d.name === t.department && d.siteId === site.id);
      if (!requirementId || !taskOwner || !dept) continue;
      const reference = formatReference(defaultNumberFormat("law-task"), year, ++lt);
      const creator = owner;
      const task = await db.lawTask.create({
        data: {
          organizationId,
          reference,
          requirementId,
          profileId: profile.id,
          title: t.title,
          details: t.details,
          ownerId: taskOwner.id,
          priority: t.priority,
          dueDate: day(t.dueInDays),
          businessUnitId: dept.businessUnitId,
          siteId: dept.siteId,
          locationId: dept.locationId,
          departmentId: dept.id,
          createdById: creator.id,
          createdAt: day(-14),
          ...(t.completed ? { status: "COMPLETED" as const, completedOn: day(-t.completed.daysAgo), completedAt: day(-t.completed.daysAgo), completedById: taskOwner.id, completionNotes: t.completed.notes } : {}),
        },
      });
      result.tasks++;
      audit.push(auditRow(organizationId, { entityType: "LawTask", entityId: task.id, action: "LAW_TASK_CREATED", actor: creator, changes: { reference, title: t.title, ownerId: taskOwner.id, priority: t.priority }, createdAt: day(-14) }));
      if (t.completed) {
        audit.push(auditRow(organizationId, { entityType: "LawTask", entityId: task.id, action: "LAW_TASK_COMPLETED", actor: taskOwner, changes: { status: { from: "OPEN", to: "COMPLETED" } }, metadata: { notes: t.completed.notes }, createdAt: day(-t.completed.daysAgo) }));
      }
    }

    for (const l of spec.links) {
      const requirementId = byKey.get(l.checklist);
      if (!requirementId) continue;
      const target =
        l.kind === "RiskAssessment"
          ? await db.riskAssessment.findFirst({ where: { organizationId, siteId: site.id, archivedAt: null }, orderBy: { reference: "asc" }, select: { id: true, reference: true, title: true } })
          : await db.incident.findFirst({ where: { organizationId, siteId: site.id, archivedAt: null, isAnonymous: false }, orderBy: { reference: "asc" }, select: { id: true, reference: true, title: true } });
      if (!target) continue;
      await db.lawLink.create({ data: { organizationId, requirementId, targetType: l.kind, targetId: target.id, context: l.context, createdById: owner.id, createdAt: day(-10) } });
      result.links++;
      audit.push(
        auditRow(organizationId, {
          entityType: "LawRequirement",
          entityId: requirementId,
          action: "LAW_RECORD_LINKED",
          actor: owner,
          metadata: { targetType: l.kind, targetId: target.id, label: `${target.reference} · ${target.title}`, context: l.context },
          createdAt: day(-10),
        }),
      );
    }
  }

  if (audit.length) await db.auditLog.createMany({ data: audit });
  await db.counter.upsert({ where: { organizationId_key: { organizationId, key: `legal-evaluation:${year}` } }, create: { organizationId, key: `legal-evaluation:${year}`, value: lev }, update: { value: lev } });
  await db.counter.upsert({ where: { organizationId_key: { organizationId, key: `law-task:${year}` } }, create: { organizationId, key: `law-task:${year}`, value: lt }, update: { value: lt } });
  return result;
}
