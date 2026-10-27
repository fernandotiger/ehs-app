import { randomBytes } from "node:crypto";
import type { Prisma, PrismaClient } from "../../src/generated/prisma/client";
import { parseStoredFormSchema } from "../../src/lib/forms/definition-schema";
import { fieldsForSite } from "../../src/lib/forms/questionnaire";
import { defaultRiskSettings, readRiskSettings, type RiskFormSettings } from "../../src/lib/forms/settings";
import { FMEA_FACTORS, type RiskMethod } from "../../src/lib/risk/scoring";
import { classify, scoreAssessment, scoreHazard, type HazardValues } from "../../src/server/modules/risk/scoring";
import { auditRow, type TenantSeed } from "./common";

/**
 * Risk demo data for Northstar. Idempotent: assessments, strategy and tasks are only created when
 * the tenant has no risk assessments yet (the published Risk forms come from the Form Builder seed).
 * Dates are relative to today so reviews/tasks are due or overdue whenever the seed runs.
 */

const DAY = 86_400_000;
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

function day(offset: number): Date {
  const d = new Date(Date.now() + offset * DAY);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

const LABEL_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const labelId = () => Array.from(randomBytes(8), (b) => LABEL_ALPHABET[b % LABEL_ALPHABET.length]).join("");

type FormKey = "5x5" | "FMEA" | "CHECKLIST";

interface HazardSpec {
  key: string;
  activity: string;
  name: string;
  consequence: string;
  controls: string;
  recommendation?: string;
  justification: string;
  likelihood?: number;
  severity?: number;
  /** FMEA: rating per group. */
  fmea?: { severity: number; likelihood: number; detection: number };
  checklist?: "YES" | "NO" | "NOT_APPLICABLE";
}

interface RevisionSpec {
  daysAgo: number;
  action: "APPROVED" | "TASK_RESCORE";
  comment: string;
  /** Hazard values at that time (key → partial override). */
  values?: Record<string, Partial<HazardSpec>>;
  task?: string;
  by: string;
}

interface AssessmentSpec {
  key: string;
  form: FormKey;
  title: string;
  description: string;
  department: string;
  owner: string;
  approver: string;
  participants?: string[];
  reviewInDays: number | null;
  itemType: string;
  itemIdentity: string;
  operationMode: string;
  workArea: string;
  peopleExposed?: string;
  impactContext?: string;
  status: "DRAFT" | "AWAITING_APPROVAL" | "APPROVED" | "ARCHIVED";
  createdDaysAgo: number;
  hazards: HazardSpec[];
  revisions?: RevisionSpec[];
  reviews?: { daysAgo: number; comment: string; by: string; nextInDays: number }[];
  answers?: Record<string, unknown>;
  confidential?: boolean;
}

const ASSESSMENTS: AssessmentSpec[] = [
  {
    key: "forklift",
    form: "5x5",
    title: "Forklift movement in the loading bay",
    description: "Assess pedestrian exposure during loading and unloading of trailers.",
    department: "Operations",
    owner: "sam@northstar.example",
    approver: "admin@northstar.example",
    participants: ["priya@northstar.example"],
    reviewInDays: 150,
    itemType: "Process or activity",
    itemIdentity: "Loading bay 1–3",
    operationMode: "Routine",
    workArea: "Loading bay",
    peopleExposed: "Forklift drivers, warehouse operatives, delivery drivers",
    status: "APPROVED",
    createdDaysAgo: 60,
    hazards: [
      { key: "vehicles", activity: "Loading trailers", name: "Moving vehicles", consequence: "Serious injury", controls: "Trained drivers, marked routes, speed limit 5 km/h", recommendation: "Install physical pedestrian barriers.", justification: "Daily interaction between pedestrians and forklifts.", likelihood: 4, severity: 5 },
      { key: "visibility", activity: "Reversing into the bay", name: "Poor visibility", consequence: "Collision with racking or people", controls: "Lighting, convex mirrors", justification: "Blind spots at bay doors in winter.", likelihood: 2, severity: 3 },
    ],
    revisions: [{ daysAgo: 55, action: "APPROVED", comment: "Initial assessment approved.", by: "admin@northstar.example" }],
    answers: { activityFrequency: "daily" },
  },
  {
    key: "ladder",
    form: "5x5",
    title: "Ladder LAD-001 · safe use assessment",
    description: "Assess the planned use of this ladder and the controls required by company procedures.",
    department: "Engineering",
    owner: "sam@northstar.example",
    approver: "admin@northstar.example",
    reviewInDays: -6,
    itemType: "Equipment",
    itemIdentity: "Ladder LAD-001",
    operationMode: "Maintenance",
    workArea: "Maintenance store",
    peopleExposed: "Maintenance technicians",
    status: "APPROVED",
    createdDaysAgo: 400,
    hazards: [
      { key: "fall", activity: "Use of Ladder LAD-001", name: "Fall from ladder", consequence: "Serious injury", controls: "Suitability checks, trained users, pre-use inspection, stand-off and anti-slip feet", recommendation: "Consider a podium step for routine tasks.", justification: "Potential harm remains when working at height.", likelihood: 2, severity: 5 },
    ],
    revisions: [
      { daysAgo: 380, action: "APPROVED", comment: "Initial assessment approved.", values: { fall: { likelihood: 3 } }, by: "admin@northstar.example" },
      { daysAgo: 300, action: "TASK_RESCORE", comment: "Stand-off and anti-slip feet fitted · Likelihood 3 → 2", task: "ladder-feet", by: "admin@northstar.example" },
    ],
    reviews: [{ daysAgo: 371, comment: "Controls checked; assessment remains valid.", by: "sam@northstar.example", nextInDays: -6 }],
    answers: { activityFrequency: "weekly" },
  },
  {
    key: "guarding",
    form: "5x5",
    title: "Machine guarding on the press line",
    description: "Guarding, interlocks and isolation for the hydraulic presses.",
    department: "Engineering",
    owner: "sam@northstar.example",
    approver: "emma@northstar.example",
    reviewInDays: 365,
    itemType: "Equipment",
    itemIdentity: "Press line P1–P4",
    operationMode: "Routine",
    workArea: "Production line",
    peopleExposed: "Press operators, maintenance technicians",
    status: "AWAITING_APPROVAL",
    createdDaysAgo: 8,
    hazards: [
      { key: "entanglement", activity: "Operating the press", name: "Contact with moving parts", consequence: "Amputation", controls: "Fixed guards, light curtains, two-hand controls", recommendation: "Add interlock monitoring to the PLC.", justification: "Guards are occasionally removed for set-up.", likelihood: 3, severity: 4 },
    ],
    answers: { activityFrequency: "daily" },
  },
  {
    key: "roof",
    form: "5x5",
    title: "Working at height – roof access",
    description: "Roof inspections and gutter clearing at Dublin Plant.",
    department: "Whole Site",
    owner: "sam@northstar.example",
    approver: "admin@northstar.example",
    reviewInDays: null,
    itemType: "Location or area",
    itemIdentity: "Main building roof",
    operationMode: "Non-routine",
    workArea: "Outdoor yard",
    status: "DRAFT",
    createdDaysAgo: 3,
    hazards: [{ key: "edge", activity: "Walking to the gutters", name: "Fall from roof edge", consequence: "Fatal injury", controls: "", justification: "", likelihood: 3, severity: 5 }],
  },
  {
    key: "solvent",
    form: "FMEA",
    title: "Solvent storage and transfer",
    description: "Bulk solvent delivery, storage in the tank farm and transfer to the paint line.",
    department: "Operations",
    owner: "emma@northstar.example",
    approver: "admin@northstar.example",
    reviewInDays: 9,
    itemType: "Substance",
    itemIdentity: "Solvent tank farm",
    operationMode: "Routine",
    workArea: "Outdoor yard",
    impactContext: "Surface water drain to the River Liffey 200 m downstream; residential area to the north.",
    status: "APPROVED",
    createdDaysAgo: 120,
    hazards: [
      { key: "release", activity: "Tanker off-loading", name: "Release to surface water", consequence: "Water contamination", controls: "Bunded storage, spill kits, drain covers, trained operators", recommendation: "Fit an automatic shut-off on the interceptor.", justification: "Delivery hose failure would reach the drain within minutes.", fmea: { severity: 6, likelihood: 4, detection: 3 } },
      { key: "vapour", activity: "Transfer pumping", name: "Vapour emissions", consequence: "Air quality complaints", controls: "Vapour return line, closed transfer", justification: "Emissions only during transfer.", fmea: { severity: 5, likelihood: 3, detection: 2 } },
    ],
    revisions: [{ daysAgo: 110, action: "APPROVED", comment: "Environmental aspects approved.", by: "admin@northstar.example" }],
    answers: { receivingEnvironment: "Storm drain → River Liffey" },
  },
  {
    key: "racking",
    form: "CHECKLIST",
    title: "Warehouse racking inspection",
    description: "Monthly checklist of pallet racking condition in the Cork warehouse.",
    department: "Third Parties",
    owner: "sarah@northstar.example",
    approver: "admin@northstar.example",
    reviewInDays: 40,
    itemType: "Location or area",
    itemIdentity: "Racking aisles A–F",
    operationMode: "Routine",
    workArea: "Warehouse",
    peopleExposed: "Warehouse operatives, contractors",
    status: "APPROVED",
    createdDaysAgo: 90,
    hazards: [
      { key: "uprights", activity: "Aisle inspection", name: "Damaged uprights", consequence: "Racking collapse", controls: "Monthly inspection, impact protectors", justification: "Inspection found no damage.", checklist: "YES" },
      { key: "loadsigns", activity: "Aisle inspection", name: "Load notices displayed", consequence: "Overloading", controls: "Load notices at each bay end", justification: "Not applicable to the mezzanine.", checklist: "NOT_APPLICABLE" },
      { key: "beams", activity: "Aisle inspection", name: "Beam locks missing", consequence: "Beam dislodged by forklift", controls: "Beam locks fitted at installation", justification: "Two beam locks missing in aisle C.", checklist: "NO" },
    ],
    revisions: [{ daysAgo: 85, action: "APPROVED", comment: "Checklist approved.", by: "admin@northstar.example" }],
    answers: { areaInspected: "Aisles A–F" },
    confidential: true,
  },
  {
    key: "dispatch",
    form: "5x5",
    title: "Manual handling in dispatch",
    description: "Lifting and carrying cartons during order picking and dispatch.",
    department: "Third Parties",
    owner: "sarah@northstar.example",
    approver: "emma@northstar.example",
    reviewInDays: 200,
    itemType: "Process or activity",
    itemIdentity: "Dispatch area",
    operationMode: "Routine",
    workArea: "Warehouse",
    peopleExposed: "Pickers, packers, agency staff",
    status: "APPROVED",
    createdDaysAgo: 200,
    hazards: [{ key: "lifting", activity: "Picking cartons", name: "Repetitive lifting", consequence: "Back injury", controls: "Lifting aids, team lifts above 25 kg, training", justification: "Weights mostly below 15 kg.", likelihood: 2, severity: 3 }],
    revisions: [{ daysAgo: 190, action: "APPROVED", comment: "Approved after site visit.", by: "emma@northstar.example" }],
    reviews: [{ daysAgo: 6, comment: "Controls checked; assessment remains valid.", by: "sarah@northstar.example", nextInDays: 200 }],
    answers: { activityFrequency: "daily" },
  },
  {
    key: "compressor",
    form: "5x5",
    title: "Old compressor room",
    description: "Compressor room decommissioned in 2026.",
    department: "Engineering",
    owner: "sam@northstar.example",
    approver: "admin@northstar.example",
    reviewInDays: -100,
    itemType: "Location or area",
    itemIdentity: "Compressor room B",
    operationMode: "Maintenance",
    workArea: "Workshop",
    status: "ARCHIVED",
    createdDaysAgo: 500,
    hazards: [{ key: "noise", activity: "Maintenance visits", name: "Noise", consequence: "Hearing damage", controls: "Hearing protection zone", justification: "Levels above 85 dB(A).", likelihood: 3, severity: 3 }],
    revisions: [{ daysAgo: 480, action: "APPROVED", comment: "Initial assessment approved.", by: "admin@northstar.example" }],
  },
];

interface TaskSpec {
  key: string;
  kind: "RA" | "MP";
  title: string;
  info?: string;
  owner: string;
  programme: string;
  assessment?: string;
  hazard?: string;
  factor?: string;
  original?: number;
  target?: number;
  parent?: string;
  createdDaysAgo: number;
  dueInDays: number;
  status: "OPEN" | "IN_PROGRESS" | "COMPLETED";
  completed?: { daysAgo: number; comment: string; actual?: number; by: string };
}

const TASKS: TaskSpec[] = [
  { key: "barrier", kind: "RA", title: "Install pedestrian barrier", info: "Separate the pedestrian route from forklift movements at bays 1–3.", owner: "sam@northstar.example", programme: "segregation", assessment: "forklift", hazard: "vehicles", factor: "likelihood", original: 4, target: 2, createdDaysAgo: 40, dueInDays: 12, status: "IN_PROGRESS" },
  { key: "quotes", kind: "RA", title: "Obtain barrier quotations", info: "Compare three suppliers.", owner: "priya@northstar.example", programme: "segregation", assessment: "forklift", hazard: "vehicles", parent: "barrier", createdDaysAgo: 40, dueInDays: -5, status: "OPEN" },
  { key: "briefing", kind: "MP", title: "Run a refresher briefing for drivers", info: "Toolbox talk on the new pedestrian route.", owner: "priya@northstar.example", programme: "segregation", createdDaysAgo: 10, dueInDays: 4, status: "OPEN" },
  { key: "briefing-sheet", kind: "MP", title: "Prepare the briefing sheet", owner: "sam@northstar.example", programme: "segregation", parent: "briefing", createdDaysAgo: 10, dueInDays: 1, status: "COMPLETED", completed: { daysAgo: 2, comment: "Sheet approved by EHS.", by: "sam@northstar.example" } },
  { key: "ladder-feet", kind: "RA", title: "Fit ladder stand-off and anti-slip feet", owner: "priya@northstar.example", programme: "segregation", assessment: "ladder", hazard: "fall", factor: "likelihood", original: 3, target: 2, createdDaysAgo: 330, dueInDays: -305, status: "COMPLETED", completed: { daysAgo: 300, comment: "Stand-off and anti-slip feet fitted", actual: 2, by: "admin@northstar.example" } },
  { key: "beam-locks", kind: "RA", title: "Replace missing beam locks in aisle C", owner: "sarah@northstar.example", programme: "waste", assessment: "racking", hazard: "beams", createdDaysAgo: 20, dueInDays: -3, status: "OPEN" },
  { key: "packaging", kind: "MP", title: "Evaluate reusable packaging suppliers", info: "Document feasibility and costs.", owner: "sarah@northstar.example", programme: "waste", createdDaysAgo: 30, dueInDays: -2, status: "OPEN" },
];

export async function seedRisk(db: PrismaClient, seed: TenantSeed): Promise<void> {
  const organizationId = seed.organizationId;
  if ((await db.riskAssessment.count({ where: { organizationId } })) > 0) return;

  const forms = new Map<FormKey, { id: string; version: number; name: string; formId: string; purpose: string; fields: ReturnType<typeof parseStoredFormSchema>; settings: unknown }>();
  for (const purpose of ["5x5", "FMEA", "CHECKLIST"] as const) {
    const def = await db.formDefinition.findFirst({ where: { organizationId, module: "risk", purpose, currentVersionId: { not: null } }, orderBy: { createdAt: "asc" }, select: { currentVersionId: true } });
    const v = def?.currentVersionId ? await db.formVersion.findUnique({ where: { id: def.currentVersionId } }) : null;
    if (v) forms.set(purpose, { id: v.id, version: v.version, name: v.name, formId: v.formId, purpose: v.purpose, fields: parseStoredFormSchema(v.fields), settings: v.settings });
  }
  if (!forms.has("5x5")) {
    console.log("    (no published Risk forms – risk demo data skipped)");
    return;
  }

  const user = (email: string) => {
    const id = seed.users.get(email);
    if (!id) throw new Error(`Seed user ${email} missing`);
    return id;
  };
  const names = new Map((await db.user.findMany({ where: { organizationId }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  const actor = (email: string) => ({ id: user(email), name: names.get(user(email)) ?? email });
  const departments = await db.department.findMany({ where: { organizationId } });
  const sites = new Map((await db.site.findMany({ where: { organizationId } })).map((s) => [s.id, s.name]));
  const locations = new Map((await db.location.findMany({ where: { organizationId } })).map((l) => [l.id, l.name]));
  const dept = (name: string) => {
    const d = departments.find((x) => x.name === name);
    if (!d) throw new Error(`Department ${name} missing`);
    return d;
  };
  const year = new Date().getUTCFullYear();
  const audit: Prisma.AuditLogCreateManyInput[] = [];
  const assessmentIds = new Map<string, string>();
  const hazardIds = new Map<string, string>();
  const assessmentMeta = new Map<string, { method: RiskMethod; domain: string; rules: RiskFormSettings; placement: { businessUnitId: string | null; siteId: string | null; locationId: string | null; departmentId: string | null } }>();
  let assessmentNo = 0;

  const values = (method: RiskMethod, domain: string, h: HazardSpec): HazardValues => {
    if (method === "FMEA") {
      const r = h.fmea!;
      return { factors: Object.fromEntries(FMEA_FACTORS[domain === "ENVIRONMENT" ? "ENVIRONMENT" : "HEALTH_SAFETY"].map((f) => [f.key, r[f.group]])) };
    }
    if (method === "CHECKLIST") return { checklistResult: h.checklist ?? null };
    return { likelihood: h.likelihood ?? null, severity: h.severity ?? null };
  };

  for (const s of ASSESSMENTS) {
    const form = forms.get(s.form);
    if (!form) continue;
    const d = dept(s.department);
    const rules = readRiskSettings(form.settings) ?? defaultRiskSettings(form.purpose as RiskMethod);
    const method = rules.method;
    const domain = rules.domain;
    const snapshot = { formId: form.formId, versionId: form.id, version: form.version, name: form.name, module: "risk", purpose: form.purpose, siteId: d.siteId, fields: fieldsForSite(form.fields, d.siteId), settings: form.settings, capturedAt: day(-s.createdDaysAgo).toISOString() };
    const hazardRows = s.hazards.map((h) => ({ spec: h, values: values(method, domain, h) }));
    const { score } = scoreAssessment(method, domain, hazardRows.map((h) => h.values));
    const band = classify(score, rules);
    const revisions = s.revisions ?? [];
    const top = hazardRows.find((h) => scoreHazard(method, domain, h.values) === score)?.values;
    const reference = `RA-${year}-${String(++assessmentNo).padStart(4, "0")}`;
    const reviews = s.reviews ?? [];
    const created = await db.riskAssessment.create({
      data: {
        organizationId,
        reference,
        labelId: labelId(),
        title: s.title,
        description: s.description,
        businessUnitId: d.businessUnitId,
        siteId: d.siteId,
        locationId: d.locationId,
        departmentId: d.id,
        ownerId: user(s.owner),
        approverId: user(s.approver),
        reviewDate: s.reviewInDays === null ? null : day(s.reviewInDays),
        participantIds: (s.participants ?? []).map(user),
        itemType: s.itemType,
        itemIdentity: s.itemIdentity,
        operationMode: s.operationMode,
        workArea: s.workArea,
        peopleExposed: s.peopleExposed ?? null,
        impactContext: s.impactContext ?? null,
        status: s.status,
        revision: revisions.length,
        form: json(snapshot),
        formVersionId: form.id,
        method,
        domain,
        rules: json(rules),
        answers: json({
          riskTitle: s.title,
          hazard: s.hazards.map((h) => h.name).join("; "),
          site: [sites.get(d.siteId), locations.get(d.locationId), d.name].filter(Boolean).join(" · "),
          owner: user(s.owner),
          ...(s.reviewInDays !== null ? { reviewDate: day(s.reviewInDays).toISOString().slice(0, 10) } : {}),
          ...(top?.likelihood ? { likelihood: String(top.likelihood), severity: String(top.severity) } : {}),
          ...s.answers,
        }),
        currentScore: score,
        band,
        isConfidential: Boolean(s.confidential),
        submittedAt: s.status === "DRAFT" ? null : day(-s.createdDaysAgo + 1),
        approvedAt: revisions.length ? day(-revisions[0]!.daysAgo) : null,
        approvedById: revisions.length ? user(revisions[0]!.by) : null,
        lastReviewedAt: reviews.length ? day(-reviews[reviews.length - 1]!.daysAgo) : null,
        archivedAt: s.status === "ARCHIVED" ? day(-20) : null,
        createdById: user(s.owner),
        createdAt: day(-s.createdDaysAgo),
      },
      select: { id: true },
    });
    assessmentIds.set(s.key, created.id);
    assessmentMeta.set(s.key, { method, domain, rules, placement: { businessUnitId: d.businessUnitId, siteId: d.siteId, locationId: d.locationId, departmentId: d.id } });
    for (const [i, h] of hazardRows.entries()) {
      const row = await db.riskHazard.create({
        data: {
          organizationId,
          assessmentId: created.id,
          sortOrder: i,
          activity: h.spec.activity,
          name: h.spec.name,
          consequence: h.spec.consequence,
          controls: h.spec.controls,
          recommendation: h.spec.recommendation ?? null,
          justification: h.spec.justification,
          likelihood: h.values.likelihood ?? null,
          severity: h.values.severity ?? null,
          factors: h.values.factors ? json(h.values.factors) : undefined,
          checklistResult: (h.values.checklistResult as string | null | undefined) ?? null,
          score: scoreHazard(method, domain, h.values),
        },
      });
      hazardIds.set(`${s.key}:${h.spec.key}`, row.id);
    }
    // Retained revision snapshots (values at that time).
    for (const [i, r] of revisions.entries()) {
      const at = hazardRows.map((h) => {
        const patched = { ...h.spec, ...(r.values?.[h.spec.key] ?? {}) };
        const v = values(method, domain, patched);
        return { id: hazardIds.get(`${s.key}:${h.spec.key}`)!, activity: patched.activity, name: patched.name, consequence: patched.consequence, controls: patched.controls, recommendation: patched.recommendation ?? null, justification: patched.justification, likelihood: v.likelihood ?? null, severity: v.severity ?? null, factors: v.factors ?? null, checklistResult: v.checklistResult ?? null, score: scoreHazard(method, domain, v) };
      });
      const revScore = scoreAssessment(method, domain, at).score;
      await db.riskRevision.create({
        data: {
          organizationId,
          assessmentId: created.id,
          revision: i + 1,
          date: day(-r.daysAgo),
          action: r.action,
          comment: r.comment,
          score: revScore,
          band: classify(revScore, rules),
          hazards: json(at),
          taskReference: r.task ? `pending:${r.task}` : null,
          actorId: user(r.by),
          actorName: actor(r.by).name,
          createdAt: day(-r.daysAgo),
        },
      });
      audit.push(auditRow(organizationId, { entityType: "RiskAssessment", entityId: created.id, action: r.action === "APPROVED" ? "RISK_APPROVED" : "RISK_RESCORED", actor: actor(r.by), changes: { revision: i + 1, score: revScore }, createdAt: day(-r.daysAgo) }));
    }
    for (const r of reviews) {
      await db.riskReview.create({
        data: { organizationId, assessmentId: created.id, reviewDate: day(-r.daysAgo), comment: r.comment, nextReviewDate: day(r.nextInDays), reviewerId: user(r.by), reviewerName: actor(r.by).name, revision: revisions.length, score, createdAt: day(-r.daysAgo) },
      });
      audit.push(auditRow(organizationId, { entityType: "RiskAssessment", entityId: created.id, action: "RISK_REVIEWED", actor: actor(r.by), metadata: { comment: r.comment }, createdAt: day(-r.daysAgo) }));
    }
    audit.push(auditRow(organizationId, { entityType: "RiskAssessment", entityId: created.id, action: s.status === "DRAFT" ? "RISK_DRAFT_SAVED" : "RISK_SUBMITTED", actor: actor(s.owner), changes: { reference, title: s.title }, createdAt: day(-s.createdDaysAgo) }));
    if (s.status === "ARCHIVED") audit.push(auditRow(organizationId, { entityType: "RiskAssessment", entityId: created.id, action: "RISK_ARCHIVED", actor: actor("admin@northstar.example"), createdAt: day(-20) }));
  }

  // Related assessments (same site): forklift ↔ guarding? (both Dublin)
  const forklift = assessmentIds.get("forklift");
  const solvent = assessmentIds.get("solvent");
  if (forklift && solvent) {
    await db.recordLink.create({ data: { organizationId, sourceType: "RiskAssessment", sourceId: forklift, sourceKey: solvent, kind: "related-assessment", targetType: "RiskAssessment", targetId: solvent, createdById: user("admin@northstar.example") } });
  }

  // ── Objectives, targets, programmes ───────────────────────────────────────
  const ops = dept("Operations");
  const tp = dept("Third Parties");
  const objective1 = await db.riskObjective.create({
    data: { organizationId, title: "Reduce transport exposure", domain: "Health & Safety", businessUnitId: ops.businessUnitId, siteId: ops.siteId, locationId: ops.locationId, departmentId: ops.id, ownerId: user("sam@northstar.example"), deadline: day(66), description: "Reduce exposure to high-risk transport activities through segregation and competent drivers.", status: "ACTIVE", createdById: user("admin@northstar.example") },
  });
  const objective2 = await db.riskObjective.create({
    data: { organizationId, title: "Reduce waste and resource consumption", domain: "Environment", businessUnitId: tp.businessUnitId, siteId: tp.siteId, locationId: tp.locationId, departmentId: tp.id, ownerId: user("sarah@northstar.example"), deadline: day(66), description: "Minimise waste generation and increase recycling at Cork Distribution.", status: "ACTIVE", createdById: user("admin@northstar.example") },
  });
  const t1 = await db.riskTarget.create({ data: { organizationId, objectiveId: objective1.id, title: "Unsafe observations on transport routes", ownerId: user("sam@northstar.example"), deadline: day(36), direction: "DECREASE", unit: "observation points", baseline: 100, current: 90, goal: 80, status: "ACTIVE" } });
  const t2 = await db.riskTarget.create({ data: { organizationId, objectiveId: objective1.id, title: "Operational assessments reviewed on time", ownerId: user("emma@northstar.example"), deadline: day(66), direction: "INCREASE", unit: "%", baseline: 60, current: 82, goal: 100, status: "ACTIVE" } });
  const t3 = await db.riskTarget.create({ data: { organizationId, objectiveId: objective2.id, title: "Increase site recycling rate", ownerId: user("sarah@northstar.example"), deadline: day(66), direction: "INCREASE", unit: "%", baseline: 40, current: 58, goal: 75, status: "ACTIVE" } });
  const programmes = new Map<string, { id: string; placement: { businessUnitId: string | null; siteId: string | null; locationId: string | null; departmentId: string | null } }>();
  const p1 = await db.riskProgramme.create({
    data: {
      organizationId,
      objectiveId: objective1.id,
      title: "Install segregation in the loading bay",
      businessUnitId: ops.businessUnitId,
      siteId: ops.siteId,
      locationId: ops.locationId,
      departmentId: ops.id,
      ownerId: user("sam@northstar.example"),
      startDate: day(-45),
      deadline: day(36),
      means: "Pedestrian barriers, driver refresher training and route marking. Contractor installation over two weekends.",
      budget: 12000,
      status: "ACTIVE",
      createdById: user("admin@northstar.example"),
      targets: { create: [{ organizationId, targetId: t1.id }, { organizationId, targetId: t2.id }] },
    },
  });
  programmes.set("segregation", { id: p1.id, placement: { businessUnitId: ops.businessUnitId, siteId: ops.siteId, locationId: ops.locationId, departmentId: ops.id } });
  const p2 = await db.riskProgramme.create({
    data: {
      organizationId,
      objectiveId: objective2.id,
      title: "Waste minimisation programme",
      businessUnitId: tp.businessUnitId,
      siteId: tp.siteId,
      locationId: tp.locationId,
      departmentId: tp.id,
      ownerId: user("sarah@northstar.example"),
      startDate: day(-30),
      deadline: day(66),
      means: "Review packaging and engage suppliers on reusable materials.",
      budget: 5000,
      status: "PLANNED",
      createdById: user("admin@northstar.example"),
      targets: { create: [{ organizationId, targetId: t3.id }] },
    },
  });
  programmes.set("waste", { id: p2.id, placement: { businessUnitId: tp.businessUnitId, siteId: tp.siteId, locationId: tp.locationId, departmentId: tp.id } });

  // ── Tasks ─────────────────────────────────────────────────────────────────
  const taskIds = new Map<string, { id: string; reference: string }>();
  let taskNo = 0;
  for (const t of TASKS) {
    const programme = programmes.get(t.programme)!;
    const placement = t.assessment ? assessmentMeta.get(t.assessment)!.placement : programme.placement;
    const reference = `RT-${year}-${String(++taskNo).padStart(4, "0")}`;
    const row = await db.riskTask.create({
      data: {
        organizationId,
        reference,
        kind: t.kind,
        title: t.title,
        info: t.info ?? null,
        ownerId: user(t.owner),
        createdOn: day(-t.createdDaysAgo),
        dueDate: day(t.dueInDays),
        programmeId: programme.id,
        assessmentId: t.assessment ? assessmentIds.get(t.assessment)! : null,
        hazardId: t.assessment && t.hazard ? hazardIds.get(`${t.assessment}:${t.hazard}`)! : null,
        factor: t.factor ?? null,
        originalValue: t.original ?? null,
        targetValue: t.target ?? null,
        actualValue: t.completed?.actual ?? null,
        parentId: t.parent ? taskIds.get(t.parent)!.id : null,
        status: t.status,
        completionComment: t.completed?.comment ?? null,
        completedOn: t.completed ? day(-t.completed.daysAgo) : null,
        completedAt: t.completed ? day(-t.completed.daysAgo) : null,
        completedById: t.completed ? user(t.completed.by) : null,
        ...placement,
        createdById: user("admin@northstar.example"),
        createdAt: day(-t.createdDaysAgo),
      },
    });
    taskIds.set(t.key, { id: row.id, reference });
    audit.push(auditRow(organizationId, { entityType: "RiskTask", entityId: row.id, action: "RISK_TASK_CREATED", actor: actor("admin@northstar.example"), changes: { reference, title: t.title }, createdAt: day(-t.createdDaysAgo) }));
    if (t.completed) audit.push(auditRow(organizationId, { entityType: "RiskTask", entityId: row.id, action: "RISK_TASK_COMPLETED", actor: actor(t.completed.by), metadata: { comment: t.completed.comment }, createdAt: day(-t.completed.daysAgo) }));
  }
  // Task-driven revisions reference their task.
  for (const [key, task] of taskIds) {
    await db.riskRevision.updateMany({ where: { organizationId, taskReference: `pending:${key}` }, data: { taskId: task.id, taskReference: task.reference } });
  }

  await db.auditLog.createMany({ data: audit });
  for (const [key, value] of [
    [`risk-assessment:${year}`, assessmentNo],
    [`risk-task:${year}`, taskNo],
  ] as const) {
    await db.counter.upsert({ where: { organizationId_key: { organizationId, key } }, create: { organizationId, key, value }, update: { value } });
  }
}
