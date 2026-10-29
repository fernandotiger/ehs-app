import type { Prisma, PrismaClient } from "../../src/generated/prisma/client";
import { auditRow } from "./common";
import { SLAW_SEED_CATEGORIES, SLAW_SEED_LIBRARY, type SlawSeedItem } from "./simplified-law-library";

/**
 * Simplified law demo data for Northstar (real Irish / EU legislation, see simplified-law-library.ts). Idempotent:
 *  - the settings row, categories and sub-categories are created when missing (matched by name);
 *  - each library law is created when no law with its `sourceKey` exists (company edits are never overwritten);
 *  - demo answers (applicability, compliance, actions) are only applied when the tenant had no Simplified law
 *    legislation before this run;
 *  - the daily overdue job gets the `slaw.action` target when missing.
 * Dates are relative to today, so one action is always overdue and others fall due soon.
 *
 * Existing databases: `bash scripts/localdb.sh npm run db:seed:simplified-law` (local only by default).
 */

const DAY = 86_400_000;
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

function day(offset: number): Date {
  const d = new Date(Date.now() + offset * DAY);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

const at = (offset: number) => new Date(Date.now() + offset * DAY);

type Answer = "YES" | "NO" | null;
type Compliance = "COMPLIANT" | "NOT_COMPLIANT" | "NOT_APPLICABLE" | "NOT_ASSESSED";

interface RequirementState {
  compliance: Compliance;
  reason?: string;
  action?: { text: string; owner: string; dueInDays: number; done?: { daysAgo: number; note: string } };
}

interface LawState {
  decision: "APPLIES" | "DOES_NOT_APPLY";
  reason: string;
  by: string;
  daysAgo: number;
  /** Per question (by index); missing = not answered. "NO*" answers every question No. */
  answers: ([Answer, string] | undefined)[] | "ALL_NO";
  /** Per requirement (by index); missing = not assessed. */
  requirements?: (RequirementState | undefined)[];
}

const ADMIN = "admin@northstar.example";
const EMMA = "emma@northstar.example";
const SAM = "sam@northstar.example";
const JOHN = "john@northstar.example";
const LIAM = "liam@northstar.example";

/** Demo answers – a mix of every state the screens show. */
const STATES: Record<string, LawState> = {
  "shww-act-2005": {
    decision: "APPLIES",
    reason: "We employ about 250 people at Dublin Plant and Cork Distribution.",
    by: EMMA,
    daysAgo: 40,
    answers: [["YES", "About 250 employees"], ["YES", "Contractors and visitors every day"], ["YES", "Both sites"], ["NO", "We are a company, not self-employed"]],
    requirements: [
      { compliance: "COMPLIANT", reason: "Site risk assessments reviewed in March 2026 – see the Risk register." },
      { compliance: "COMPLIANT", reason: "Safety statement version 7, signed by the managing director." },
      { compliance: "NOT_COMPLIANT", reason: "Night shift at Cork not briefed on the 2026 safety statement yet.", action: { text: "Brief the Cork night shift on the 2026 safety statement at the November toolbox talk", owner: EMMA, dueInDays: 14 } },
      { compliance: "COMPLIANT", reason: "Emergency plan and fire wardens named for each site; drills twice a year." },
      undefined,
      { compliance: "COMPLIANT", reason: "Contractor induction and permit-to-work system in place." },
    ],
  },
  "shww-gen-app-2007": {
    decision: "APPLIES",
    reason: "Warehouse, yard and plant with forklifts, an overhead crane and racking.",
    by: EMMA,
    daysAgo: 35,
    answers: [["YES", ""], ["YES", "Forklifts and an overhead crane in Dublin"], ["YES", "Warehouse picking"], ["YES", "Racking at the Cork warehouse"], ["YES", "Office staff"]],
    requirements: [
      { compliance: "COMPLIANT", reason: "Walkways marked; monthly housekeeping inspection." },
      { compliance: "NOT_COMPLIANT", reason: "The thorough-examination certificate of the overhead crane has expired.", action: { text: "Book the thorough examination of the overhead crane and the forklift attachments", owner: SAM, dueInDays: -5 } },
      { compliance: "COMPLIANT", reason: "PPE assessment per task; issue log kept by the stores." },
      { compliance: "NOT_COMPLIANT", reason: "Three new warehouse starters have no manual handling training yet.", action: { text: "Complete manual handling training for the new warehouse starters", owner: JOHN, dueInDays: 10 } },
      { compliance: "COMPLIANT", reason: "Workstation assessments for all office staff; eye tests offered." },
      {
        compliance: "NOT_COMPLIANT",
        reason: "No guard-rail on the mezzanine edge in Cork.",
        action: { text: "Fit guard-rails on the Cork mezzanine", owner: LIAM, dueInDays: 5, done: { daysAgo: 2, note: "Guard-rails fitted by the racking contractor on Monday." } },
      },
      { compliance: "COMPLIANT", reason: "Two trained first-aiders per shift; kits checked monthly." },
    ],
  },
  "ppwr-2025-40": {
    decision: "APPLIES",
    reason: "We sell packaged products under our own brand in Ireland, Spain and France.",
    by: EMMA,
    daysAgo: 20,
    answers: [["YES", "Our EU markets: Ireland, Spain, France"], ["NO", "We make our products in Ireland"], ["YES", "Use FIBCs and pallet wrap"], ["NO", ""]],
    requirements: [
      {
        compliance: "NOT_COMPLIANT",
        reason: "Gap noted – no packaging data per material and country yet.",
        action: { text: "Complete the Repak EPR requirements: collect packaging volumes by material and country", owner: EMMA, dueInDays: 30 },
      },
      { compliance: "COMPLIANT", reason: "Member of Repak." },
      undefined,
      { compliance: "NOT_APPLICABLE", reason: "We sell our own products only – we are not a distributor of other brands." },
      { compliance: "NOT_APPLICABLE", reason: "We do not use food-contact packaging." },
    ],
  },
  "fire-services-acts-1981-2003": {
    decision: "APPLIES",
    reason: "We control two premises used as workplaces with visitors.",
    by: ADMIN,
    daysAgo: 60,
    answers: [["YES", "Dublin Plant and Cork Distribution"], ["YES", "Visitors and drivers"], ["NO", ""], ["YES", "Diesel and gas cylinders"]],
    requirements: [
      { compliance: "COMPLIANT", reason: "Housekeeping and hot-work permits; smoking only in the shelter." },
      { compliance: "COMPLIANT", reason: "Alarm, emergency lighting and extinguishers serviced by a contractor (certificates on file)." },
      { compliance: "COMPLIANT", reason: "Weekly alarm test, two drills a year, records in the fire register." },
      { compliance: "COMPLIANT", reason: "Evacuation plan with assembly points; personal plans for two employees." },
      { compliance: "COMPLIANT", reason: "Site rules in the induction for staff, visitors and contractors." },
      { compliance: "COMPLIANT", reason: "No request from the fire authority so far; assessment ready if asked." },
      { compliance: "NOT_APPLICABLE", reason: "No fire safety notice has been served on us." },
    ],
  },
  "epa-act-1992": {
    decision: "DOES_NOT_APPLY",
    reason: "None of our activities is listed in the First Schedule, so we need no EPA licence. Waste and emissions are covered by the Waste Management Act and local authority permits.",
    by: EMMA,
    daysAgo: 30,
    answers: "ALL_NO",
  },
  "waste-management-act-1996": {
    decision: "APPLIES",
    reason: "Both sites produce general, packaging and some hazardous waste (oils, aerosols).",
    by: EMMA,
    daysAgo: 3,
    answers: [["YES", ""], ["YES", "Licensed collector for each site"], ["YES", "Waste oil and aerosols from the workshop"], ["YES", "Packaging"], ["NO", ""]],
  },
};

async function ensureCategory(db: PrismaClient, organizationId: string, name: string, description: string, parentId: string | null, sortOrder: number): Promise<string> {
  const found = await db.slawCategory.findFirst({ where: { organizationId, parentId, name }, select: { id: true } });
  if (found) return found.id;
  const row = await db.slawCategory.create({ data: { organizationId, parentId, name, description, sortOrder }, select: { id: true } });
  return row.id;
}

async function createLaw(db: PrismaClient, organizationId: string, categoryId: string, item: SlawSeedItem, createdById: string | null): Promise<string> {
  const law = await db.slawLegislation.create({
    data: {
      organizationId,
      categoryId,
      title: item.title,
      shortTitle: item.shortTitle,
      reference: item.reference,
      jurisdiction: item.jurisdiction,
      status: item.status,
      kindLabel: item.kindLabel,
      relationNote: item.relationNote,
      summary: item.summary,
      officialUrl: item.officialUrl,
      guidanceUrl: item.guidanceUrl,
      sourceKey: item.key,
      createdById,
    },
    select: { id: true },
  });
  await db.slawArticle.createMany({
    data: item.articles.map((a, i) => ({
      organizationId,
      legislationId: law.id,
      chapter: a.chapter,
      number: a.number,
      title: a.title,
      appliesFrom: a.appliesFrom ? new Date(`${a.appliesFrom}T00:00:00.000Z`) : null,
      appliesTo: a.appliesTo,
      sortOrder: i,
    })),
  });
  await db.slawQuestion.createMany({ data: item.questions.map((text, i) => ({ organizationId, legislationId: law.id, text, sortOrder: i })) });
  await db.slawRequirement.createMany({ data: item.requirements.map((r, i) => ({ organizationId, legislationId: law.id, section: r.section, text: r.text, articles: r.articles, sortOrder: i })) });
  return law.id;
}

async function applyState(db: PrismaClient, organizationId: string, lawId: string, state: LawState, users: Map<string, { id: string; name: string }>): Promise<Prisma.AuditLogCreateManyInput[]> {
  const by = users.get(state.by);
  if (!by) return [];
  const audit: Prisma.AuditLogCreateManyInput[] = [];
  const questions = await db.slawQuestion.findMany({ where: { legislationId: lawId }, orderBy: { sortOrder: "asc" }, select: { id: true } });
  for (const [i, q] of questions.entries()) {
    const answer = state.answers === "ALL_NO" ? (["NO", ""] as [Answer, string]) : state.answers[i];
    if (!answer || !answer[0]) continue;
    await db.slawQuestion.update({ where: { id: q.id }, data: { answer: answer[0], reason: answer[1], answeredById: by.id, answeredAt: at(-state.daysAgo) } });
  }
  await db.slawLegislation.update({
    where: { id: lawId },
    data: { applicability: state.decision, applicabilityReason: state.reason, applicabilityById: by.id, applicabilityAt: at(-state.daysAgo) },
  });
  audit.push(
    auditRow(organizationId, {
      entityType: "SlawLegislation",
      entityId: lawId,
      action: "SLAW_APPLICABILITY_SAVED",
      actor: by,
      changes: { applicability: { from: "NOT_CHECKED", to: state.decision }, applicabilityReason: { from: "", to: state.reason } },
      metadata: { answersChanged: questions.length, closedActions: 0 },
      createdAt: at(-state.daysAgo),
    }),
  );
  const requirements = await db.slawRequirement.findMany({ where: { legislationId: lawId }, orderBy: { sortOrder: "asc" }, select: { id: true } });
  for (const [i, r] of requirements.entries()) {
    const spec = state.requirements?.[i];
    if (!spec) continue;
    const owner = spec.action ? users.get(spec.action.owner) : undefined;
    const when = at(-Math.max(state.daysAgo - 1, 1));
    await db.slawRequirement.update({
      where: { id: r.id },
      data: {
        compliance: spec.compliance,
        reason: spec.reason ?? "",
        assessedById: by.id,
        assessedAt: when,
        ...(spec.action && owner
          ? {
              actionText: spec.action.text,
              actionOwnerId: owner.id,
              actionDueDate: day(spec.action.dueInDays),
              actionStatus: spec.action.done ? "DONE" : "OPEN",
              actionSetById: by.id,
              actionSetAt: when,
              ...(spec.action.done ? { actionCompletedAt: at(-spec.action.done.daysAgo), actionCompletedById: owner.id, actionNote: spec.action.done.note } : {}),
            }
          : {}),
      },
    });
    audit.push(
      auditRow(organizationId, {
        entityType: "SlawRequirement",
        entityId: r.id,
        action: "SLAW_REQUIREMENT_ASSESSED",
        actor: by,
        changes: {
          compliance: { from: "NOT_ASSESSED", to: spec.compliance },
          ...(spec.reason ? { reason: { from: null, to: spec.reason } } : {}),
          ...(spec.action && owner ? { actionText: { from: null, to: spec.action.text }, actionOwnerId: { from: null, to: owner.id }, actionStatus: { from: "NONE", to: "OPEN" } } : {}),
        },
        createdAt: when,
      }),
    );
    if (spec.action?.done && owner) {
      audit.push(
        auditRow(organizationId, {
          entityType: "SlawRequirement",
          entityId: r.id,
          action: "SLAW_ACTION_COMPLETED",
          actor: owner,
          changes: { actionStatus: { from: "OPEN", to: "DONE" } },
          metadata: { note: spec.action.done.note },
          createdAt: at(-spec.action.done.daysAgo),
        }),
      );
    }
  }
  return audit;
}

export async function applyDemoSimplifiedLaw(db: PrismaClient, organizationId: string): Promise<{ settings: boolean; categories: number; laws: number; states: number; job: boolean }> {
  const users = new Map((await db.user.findMany({ where: { organizationId }, select: { id: true, email: true, name: true } })).map((u) => [u.email, { id: u.id, name: u.name }]));
  const firstRun = (await db.slawLegislation.count({ where: { organizationId } })) === 0;

  let settings = false;
  if (!(await db.slawSettings.findFirst({ where: { organizationId }, select: { id: true } }))) {
    await db.slawSettings.create({ data: { organizationId, registerTitle: "Northstar Legislation & Compliance Register", jurisdictions: ["EU", "Ireland"], statusLabels: json({}) } });
    settings = true;
  }

  const before = await db.slawCategory.count({ where: { organizationId } });
  const subIds = new Map<string, string>();
  for (const [ci, cat] of SLAW_SEED_CATEGORIES.entries()) {
    const catId = await ensureCategory(db, organizationId, cat.name, cat.description, null, ci);
    for (const [si, sub] of cat.subCategories.entries()) subIds.set(`${cat.name}›${sub.name}`, await ensureCategory(db, organizationId, sub.name, sub.description, catId, si));
  }
  const categories = (await db.slawCategory.count({ where: { organizationId } })) - before;

  const adminId = users.get(ADMIN)?.id ?? null;
  const existing = new Set((await db.slawLegislation.findMany({ where: { organizationId, sourceKey: { not: null } }, select: { sourceKey: true } })).map((l) => l.sourceKey));
  const created = new Map<string, string>();
  for (const item of SLAW_SEED_LIBRARY) {
    if (existing.has(item.key)) continue;
    const categoryId = subIds.get(`${item.category}›${item.subCategory}`);
    if (!categoryId) throw new Error(`Unknown sub-category for ${item.key}: ${item.category} › ${item.subCategory}`);
    created.set(item.key, await createLaw(db, organizationId, categoryId, item, adminId));
  }

  let states = 0;
  if (firstRun) {
    const audit: Prisma.AuditLogCreateManyInput[] = [];
    for (const [key, state] of Object.entries(STATES)) {
      const lawId = created.get(key);
      if (!lawId) continue;
      audit.push(...(await applyState(db, organizationId, lawId, state, users)));
      states++;
    }
    if (audit.length) await db.auditLog.createMany({ data: audit });
  }

  const job = await db.scheduledJob.findFirst({ where: { organizationId, name: "Daily overdue reminders" }, select: { id: true, targets: true } });
  const addTarget = Boolean(job && !job.targets.includes("slaw.action"));
  if (job && addTarget) await db.scheduledJob.update({ where: { id: job.id }, data: { targets: [...job.targets, "slaw.action"] } });

  return { settings, categories, laws: created.size, states, job: addTarget };
}
