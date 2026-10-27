import type { Prisma, PrismaClient } from "../../src/generated/prisma/client";
import { parseStoredFormSchema } from "../../src/lib/forms/definition-schema";
import { fieldsForSite } from "../../src/lib/forms/questionnaire";
import { CAUSE_LISTS, REPORTEE_LISTS, type ActionStateKey, type CauseGroupKey } from "../../src/lib/incidents";
import { deriveIncidentStatus, type ActionNode } from "../../src/server/modules/incidents/workflow";
import { auditRow, type TenantSeed } from "./common";
import { applyDemoIncidentTypes } from "./incident-types";

/**
 * Incident demo data. Idempotent: the demo types, subtypes and per-type forms are applied on every
 * run (`incident-types.ts`); incidents/actions are only created when the tenant has none yet.
 */

const DAY = 86_400_000;
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

function dateOnly(daysFromToday: number): Date {
  const d = new Date(Date.now() + daysFromToday * DAY);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
function at(daysAgo: number, hour = 9): Date {
  const d = dateOnly(-daysAgo);
  d.setUTCHours(hour, 15, 0, 0);
  return d;
}
const iso = (d: Date) => d.toISOString().slice(0, 10);

interface PersonSpec {
  name: string;
  personType: string;
  involvement: string;
  injuryDetails?: string;
  injuryType?: string;
  bodyPart?: string;
}

interface InvestigationSpec {
  status: "IN_PROGRESS" | "COMPLETED";
  investigator: string;
  findings: string;
  rootCause: string;
  causes: [CauseGroupKey, string][];
  hazardGroup?: string;
  environmental?: { aspect: string; description: string; duration?: number; unit?: string };
  reportable?: string[];
  absences?: { from: number; to: number; kind: string; restricted?: boolean; note?: string }[];
  hoursLost?: number;
  actionsRequired: boolean | null;
  closingDecision?: string;
}

interface IncidentSpec {
  key: string;
  title: string;
  type: string;
  subtype: string;
  severity: "MINOR" | "MAJOR" | "CRITICAL";
  department: string;
  preciseLocation: string;
  shift?: string;
  daysAgo: number;
  reporter: string;
  investigators: string[];
  narrative: string;
  immediateAction?: string;
  firstAid?: string;
  people: PersonSpec[];
  draft?: boolean;
  archived?: boolean;
  closed?: { note: string; by: string; daysAgo: number };
  investigation?: InvestigationSpec;
  extraAnswers?: Record<string, unknown>;
}

interface ActionSpec {
  key: string;
  description: string;
  kind?: "CORRECTIVE" | "PREVENTIVE";
  incidents: string[];
  owner: string;
  reviewer?: string;
  department: string;
  dueInDays: number;
  priority?: "LOW" | "NORMAL" | "HIGH" | "URGENT";
  category?: string;
  state: ActionStateKey;
  reviewInDays?: number;
  completion?: string;
  review?: string;
  parent?: string;
  tasks?: { title: string; owner: string; dueInDays: number; done?: string }[];
  trend?: { typeKey: string; days: number };
}

export interface IncidentSeedSpec {
  incidents: IncidentSpec[];
  actions: ActionSpec[];
}

export async function seedIncidents(db: PrismaClient, seed: TenantSeed, spec: IncidentSeedSpec, publishedBy: { id: string; name: string } | null): Promise<void> {
  const organizationId = seed.organizationId;
  await applyDemoIncidentTypes(db, organizationId, publishedBy);
  if ((await db.incident.count({ where: { organizationId } })) > 0) return;

  const types = await db.incidentType.findMany({ where: { organizationId }, include: { subtypes: true } });
  const lookup = await db.lookupValue.findMany({ where: { organizationId, listKey: { startsWith: "incident." } } });
  const lookupId = (listKey: string, label: string) => {
    const row = lookup.find((l) => l.listKey === listKey && l.label === label);
    if (!row) throw new Error(`Lookup ${listKey} / ${label} missing`);
    return row.id;
  };
  const versions = new Map<string, { id: string; version: number; name: string; formId: string; fields: ReturnType<typeof parseStoredFormSchema>; settings: unknown }>();
  async function formVersion(formId: string | null) {
    if (!formId) return null;
    if (!versions.has(formId)) {
      const form = await db.formDefinition.findUnique({ where: { id: formId }, select: { currentVersionId: true } });
      const v = form?.currentVersionId ? await db.formVersion.findUnique({ where: { id: form.currentVersionId } }) : null;
      if (!v) return null;
      versions.set(formId, { id: v.id, version: v.version, name: v.name, formId: v.formId, fields: parseStoredFormSchema(v.fields), settings: v.settings });
    }
    return versions.get(formId)!;
  }
  const snapshot = (v: NonNullable<Awaited<ReturnType<typeof formVersion>>>, purpose: string, siteId: string | null, capturedAt: Date) => ({
    formId: v.formId,
    versionId: v.id,
    version: v.version,
    name: v.name,
    module: "incidents",
    purpose,
    siteId,
    fields: fieldsForSite(v.fields, siteId),
    settings: v.settings,
    capturedAt: capturedAt.toISOString(),
  });

  const departments = await db.department.findMany({ where: { organizationId } });
  const sites = await db.site.findMany({ where: { organizationId } });
  const user = (email: string) => {
    const id = seed.users.get(email);
    if (!id) throw new Error(`Seed user ${email} missing`);
    return id;
  };
  const names = new Map((await db.user.findMany({ where: { organizationId }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  const actor = (email: string) => ({ id: user(email), name: names.get(user(email)) ?? email });
  const year = new Date().getUTCFullYear();
  const audit: Prisma.AuditLogCreateManyInput[] = [];
  const incidentIds = new Map<string, string>();
  let incidentNo = 0;

  for (const s of spec.incidents) {
    const type = types.find((t) => t.name === s.type)!;
    const subtype = type.subtypes.find((st) => st.name === s.subtype) ?? null;
    const dept = departments.find((d) => d.name === s.department)!;
    const site = sites.find((x) => x.id === dept.siteId)!;
    const occurredAt = at(s.daysAgo);
    const reportVersion = await formVersion(type.reportFormId);
    const reportForm = reportVersion ? snapshot(reportVersion, "REPORT", dept.siteId, occurredAt) : null;
    const answers: Record<string, unknown> = {
      incidentTitle: s.title,
      occurredAt: occurredAt.toISOString(),
      site: `${site.name} · ${dept.name}`,
      whatHappened: s.narrative,
      ...s.extraAnswers,
    };
    const reference = `INC-${year}-${String(++incidentNo).padStart(4, "0")}`;
    const created = await db.incident.create({
      data: {
        organizationId,
        reference,
        typeId: type.id,
        typeLabel: type.name,
        subtypeId: subtype?.id ?? null,
        subtypeLabel: subtype?.name ?? null,
        title: s.title,
        narrative: s.narrative,
        severity: s.severity,
        businessUnitId: dept.businessUnitId,
        siteId: dept.siteId,
        locationId: dept.locationId,
        departmentId: dept.id,
        preciseLocation: s.preciseLocation,
        shift: s.shift ?? "Day",
        occurredAt,
        investigationTargetDate: new Date(dateOnly(-s.daysAgo).getTime() + type.targetDays * DAY),
        isConfidential: type.defaultConfidential,
        isDraft: Boolean(s.draft),
        submittedAt: s.draft ? null : new Date(occurredAt.getTime() + 2 * 3_600_000),
        reporterId: user(s.reporter),
        immediateAction: s.immediateAction ?? "Area made safe and supervisor informed.",
        firstAid: s.firstAid ?? null,
        reportForm: reportForm ? json(reportForm) : undefined,
        answers: json(answers),
        searchText: `${reference}\n${s.title}`,
        closedAt: s.closed ? at(s.closed.daysAgo, 16) : null,
        closedById: s.closed ? user(s.closed.by) : null,
        closureNote: s.closed?.note ?? null,
        archivedAt: s.archived ? at(1, 12) : null,
        createdAt: occurredAt,
        people: {
          create: s.people.map((p, i) => ({ organizationId, name: p.name, personType: p.personType, involvement: p.involvement, injuryDetails: p.injuryDetails ?? null, injuryType: p.injuryType ?? null, bodyPart: p.bodyPart ?? null, sortOrder: i })),
        },
        investigators: { create: s.investigators.map((email) => ({ organizationId, userId: user(email) })) },
      },
    });
    incidentIds.set(s.key, created.id);
    audit.push(
      auditRow(organizationId, {
        entityType: "Incident",
        entityId: created.id,
        action: s.draft ? "INCIDENT_DRAFT_SAVED" : "INCIDENT_REPORTED",
        actor: actor(s.reporter),
        changes: { reference, title: s.title, type: type.name, subtype: subtype?.name ?? null, severity: s.severity },
        createdAt: new Date(occurredAt.getTime() + 2 * 3_600_000),
      }),
    );

    if (s.investigation) {
      const inv = s.investigation;
      const invVersion = await formVersion(type.investigationFormId);
      const startedAt = at(Math.max(s.daysAgo - 1, 0), 11);
      const completedAt = inv.status === "COMPLETED" ? at(Math.max(s.daysAgo - 3, 0), 15) : null;
      await db.investigation.create({
        data: {
          organizationId,
          incidentId: created.id,
          status: inv.status,
          investigatorId: user(inv.investigator),
          form: invVersion ? json(snapshot(invVersion, "INVESTIGATION", dept.siteId, startedAt)) : undefined,
          answers: json({ investigationFindings: inv.findings, rootCauseAnalysis: inv.rootCause }),
          healthSafetyImpact: Boolean(inv.hazardGroup),
          hazardGroup: inv.hazardGroup ?? null,
          environmentalImpact: Boolean(inv.environmental),
          environmentalAspect: inv.environmental?.aspect ?? null,
          environmentalDescription: inv.environmental?.description ?? null,
          environmentalDuration: inv.environmental?.duration ?? null,
          environmentalDurationUnit: inv.environmental?.duration != null ? (inv.environmental.unit ?? "MINUTES") : null,
          causeIds: inv.causes.map(([group, label]) => lookupId(CAUSE_LISTS[group], label)),
          reportable: Boolean(inv.reportable?.length),
          reporteeIds: (inv.reportable ?? []).map((label) => {
            const internal = lookup.find((l) => l.listKey === REPORTEE_LISTS.INTERNAL && l.label === label);
            return internal?.id ?? lookupId(REPORTEE_LISTS.EXTERNAL, label);
          }),
          operatingHoursLost: inv.hoursLost ?? null,
          actionsRequired: inv.actionsRequired,
          closingDecision: inv.closingDecision ?? null,
          startedAt,
          startedById: user(inv.investigator),
          completedAt,
          completedById: completedAt ? user(inv.investigator) : null,
          absences: {
            create: (inv.absences ?? []).map((a, i) => ({
              organizationId,
              startDate: dateOnly(-a.from),
              endDate: dateOnly(-a.to),
              kind: a.kind,
              restricted: Boolean(a.restricted),
              note: a.note ?? null,
              sortOrder: i,
            })),
          },
        },
      });
      audit.push(auditRow(organizationId, { entityType: "Incident", entityId: created.id, action: "INVESTIGATION_STARTED", actor: actor(inv.investigator), createdAt: startedAt }));
      if (completedAt) audit.push(auditRow(organizationId, { entityType: "Incident", entityId: created.id, action: "INVESTIGATION_COMPLETED", actor: actor(inv.investigator), createdAt: completedAt }));
    }
    if (s.closed) {
      audit.push(auditRow(organizationId, { entityType: "Incident", entityId: created.id, action: "INCIDENT_CLOSED", actor: actor(s.closed.by), changes: { closureNote: s.closed.note }, createdAt: at(s.closed.daysAgo, 16) }));
    }
  }

  // Actions (parents before follow-ups), links and tasks.
  const actionIds = new Map<string, string>();
  const nodes: ActionNode[] = [];
  let actionNo = 0;
  for (const a of spec.actions) {
    const dept = departments.find((d) => d.name === a.department)!;
    const reference = `ACT-${year}-${String(++actionNo).padStart(4, "0")}`;
    const links = a.incidents.map((k) => incidentIds.get(k)!);
    let trend: Prisma.InputJsonValue | undefined;
    if (a.trend) {
      const type = types.find((t) => t.key === a.trend!.typeKey)!;
      const from = iso(dateOnly(-a.trend.days));
      const to = iso(dateOnly(0));
      const matched = await db.incident.findMany({
        where: { organizationId, typeId: type.id, isDraft: false, archivedAt: null, occurredAt: { gte: dateOnly(-a.trend.days), lt: dateOnly(1) } },
        select: { id: true, reference: true },
        orderBy: { occurredAt: "asc" },
      });
      trend = json({ criteria: { from, to, typeId: type.id, subtypeId: null, causeId: null, departmentId: null, labels: { type: type.name } }, matched, capturedAt: at(1, 10).toISOString() });
    }
    const reviewed = a.state === "EFFECTIVE" || a.state === "INEFFECTIVE";
    const completed = reviewed || a.state === "AWAITING_EFFECTIVENESS";
    const row = await db.correctiveAction.create({
      data: {
        organizationId,
        reference,
        description: a.description,
        kind: a.kind ?? "CORRECTIVE",
        ownerId: user(a.owner),
        businessUnitId: dept.businessUnitId,
        siteId: dept.siteId,
        locationId: dept.locationId,
        departmentId: dept.id,
        dueDate: dateOnly(a.dueInDays),
        priority: a.priority ?? "NORMAL",
        capaCategory: a.category ?? null,
        reviewerId: a.reviewer ? user(a.reviewer) : null,
        plannedReviewDate: a.reviewInDays !== undefined ? dateOnly(a.reviewInDays) : null,
        state: a.state,
        completionComment: completed ? (a.completion ?? "Work completed and checked.") : null,
        completedAt: completed ? at(5, 14) : null,
        completedById: completed ? user(a.owner) : null,
        reviewComment: reviewed ? (a.review ?? "Checked in use.") : null,
        reviewedAt: reviewed ? at(2, 10) : null,
        reviewedById: reviewed && a.reviewer ? user(a.reviewer) : null,
        parentActionId: a.parent ? actionIds.get(a.parent)! : null,
        trend,
        createdById: user(a.owner),
        createdAt: at(10, 10),
        incidents: { create: links.map((incidentId) => ({ organizationId, incidentId })) },
        tasks: {
          create: (a.tasks ?? []).map((t, i) => {
            const tdept = dept;
            return {
              organizationId,
              title: t.title,
              ownerId: user(t.owner),
              businessUnitId: tdept.businessUnitId,
              siteId: tdept.siteId,
              locationId: tdept.locationId,
              departmentId: tdept.id,
              dueDate: dateOnly(t.dueInDays),
              done: Boolean(t.done),
              completionComment: t.done ?? null,
              completedAt: t.done ? at(6, 12) : null,
              completedById: t.done ? user(t.owner) : null,
              sortOrder: i,
            };
          }),
        },
      },
    });
    actionIds.set(a.key, row.id);
    nodes.push({ id: row.id, reference, state: a.state, parentActionId: row.parentActionId, incidentIds: links });
    audit.push(auditRow(organizationId, { entityType: "CorrectiveAction", entityId: row.id, action: a.parent ? "ACTION_FOLLOW_UP_RAISED" : "ACTION_CREATED", actor: actor(a.owner), changes: { reference, description: a.description }, createdAt: at(10, 10) }));
    for (const incidentId of links) {
      audit.push(auditRow(organizationId, { entityType: "Incident", entityId: incidentId, action: "ACTION_LINKED", actor: actor(a.owner), metadata: { actionId: row.id, reference }, createdAt: at(10, 10) }));
    }
  }

  // Cached derived status.
  for (const s of spec.incidents) {
    const id = incidentIds.get(s.key)!;
    const status = deriveIncidentStatus({
      isDraft: Boolean(s.draft),
      closed: Boolean(s.closed),
      investigation: s.investigation ? { status: s.investigation.status, actionsRequired: s.investigation.actionsRequired } : null,
      actions: nodes.filter((n) => n.incidentIds.includes(id)),
    });
    await db.incident.update({ where: { id }, data: { status } });
  }

  await db.auditLog.createMany({ data: audit });
  for (const [key, value] of [
    [`incident:${year}`, incidentNo],
    [`corrective-action:${year}`, actionNo],
  ] as const) {
    await db.counter.upsert({ where: { organizationId_key: { organizationId, key } }, create: { organizationId, key, value }, update: { value } });
  }
}

// ── Demo content ────────────────────────────────────────────────────────────

const WITNESS = (name: string, personType = "EMPLOYEE"): PersonSpec => ({ name, personType, involvement: "WITNESS", injuryDetails: "None" });

export const NORTHSTAR_INCIDENTS: IncidentSeedSpec = {
  incidents: [
    {
      key: "draft",
      title: "Loading-bay observation",
      type: "Near Miss",
      subtype: "RTA",
      severity: "MINOR",
      department: "Third Parties",
      preciseLocation: "Loading bay 3",
      daysAgo: 1,
      reporter: "john@northstar.example",
      investigators: [],
      narrative: "A delivery van reversed close to the pedestrian walkway.",
      people: [],
      draft: true,
    },
    {
      key: "open",
      title: "Loose ladder foot spotted before use",
      type: "Near Miss",
      subtype: "Equipment",
      severity: "MAJOR",
      department: "Engineering",
      preciseLocation: "Workshop",
      daysAgo: 2,
      reporter: "priya@northstar.example",
      investigators: ["sam@northstar.example"],
      narrative: "The pre-use check identified a damaged foot; the ladder was isolated.",
      immediateAction: "Removed from service",
      people: [{ name: "Unknown", personType: "CONTRACTOR", involvement: "WITNESS", injuryDetails: "None" }],
    },
    {
      key: "investigating",
      title: "Near miss at loading bay",
      type: "Near Miss",
      subtype: "RTA",
      severity: "MAJOR",
      department: "Third Parties",
      preciseLocation: "Loading bay 2",
      daysAgo: 6,
      reporter: "john@northstar.example",
      investigators: ["liam@northstar.example"],
      narrative: "A pedestrian entered the forklift route. The driver stopped safely.",
      people: [WITNESS("Jordan Kelly"), { name: "Unknown", personType: "VISITOR", involvement: "OTHER", injuryDetails: "None" }],
      investigation: {
        status: "IN_PROGRESS",
        investigator: "liam@northstar.example",
        findings: "Route markings are faded near the gate.",
        rootCause: "",
        causes: [["WORKPLACE", "Poor signage"]],
        hazardGroup: "Workplace transport",
        actionsRequired: null,
      },
    },
    {
      key: "action-required",
      title: "Missing pedestrian signage",
      type: "Inspection Finding",
      subtype: "Audit Finding",
      severity: "MINOR",
      department: "Third Parties",
      preciseLocation: "Warehouse aisle 4",
      daysAgo: 12,
      reporter: "liam@northstar.example",
      investigators: ["liam@northstar.example"],
      narrative: "Pedestrian signage at aisle 4 is missing after racking works.",
      people: [WITNESS("Liam Byrne")],
      investigation: {
        status: "COMPLETED",
        investigator: "liam@northstar.example",
        findings: "Signs were removed during the racking upgrade and not replaced.",
        rootCause: "No reinstatement step in the contractor handover checklist.",
        causes: [["WORKPLACE", "Poor signage"], ["METHODS", "Inadequate procedure"]],
        hazardGroup: "Workplace transport",
        actionsRequired: true,
        closingDecision: "Replace signage and add a reinstatement step to handovers.",
      },
    },
    {
      key: "spill",
      title: "Hydraulic oil spill contained",
      type: "Incident",
      subtype: "Spills",
      severity: "MAJOR",
      department: "Operations",
      preciseLocation: "Press line 2",
      daysAgo: 20,
      reporter: "sam@northstar.example",
      investigators: ["sam@northstar.example"],
      narrative: "A hydraulic hose failed and around 20 litres of oil leaked; spill kits contained it.",
      people: [WITNESS("Sam O'Brien")],
      investigation: {
        status: "COMPLETED",
        investigator: "sam@northstar.example",
        findings: "Hose failure; containment prevented drain contamination.",
        rootCause: "Hose exceeded its replacement interval.",
        causes: [["EQUIPMENT", "Defective equipment"], ["METHODS", "Insufficient maintenance"]],
        environmental: { aspect: "Oil storage and handling", description: "Potential surface water pollution (contained).", duration: 30, unit: "MINUTES" },
        reportable: ["EHS leadership"],
        hoursLost: 4,
        actionsRequired: true,
        closingDecision: "Replace hose and inspect all hydraulic lines.",
      },
    },
    {
      key: "slip",
      title: "Slip near wash station",
      type: "Accident",
      subtype: "3 Days Accident (Reportable)",
      severity: "MAJOR",
      department: "Whole Site",
      preciseLocation: "Wash station B",
      daysAgo: 30,
      reporter: "sam@northstar.example",
      investigators: ["emma@northstar.example"],
      narrative: "An operator slipped on standing water and injured their wrist.",
      firstAid: "First aider attended; referred to the local clinic.",
      people: [{ name: "Ciara Doyle", personType: "EMPLOYEE", involvement: "INJURED", injuryDetails: "Sprained right wrist", injuryType: "Sprain or strain", bodyPart: "Arm" }],
      investigation: {
        status: "COMPLETED",
        investigator: "emma@northstar.example",
        findings: "Drainage is blocked and the floor was not signed as wet.",
        rootCause: "No cleaning schedule for the drain.",
        causes: [["WORKPLACE", "Poor housekeeping"]],
        hazardGroup: "Slips, trips and falls",
        reportable: ["EHS leadership"],
        absences: [
          { from: 29, to: 27, kind: "Lost time injury", note: "Three calendar days absent." },
          { from: 26, to: 25, kind: "Restricted duties", restricted: true, note: "Light duties only." },
        ],
        actionsRequired: true,
        closingDecision: "Improve drainage and housekeeping.",
      },
    },
    {
      key: "forklift",
      title: "Forklift reversing observation",
      type: "Near Miss",
      subtype: "RTA",
      severity: "MINOR",
      department: "Third Parties",
      preciseLocation: "Yard",
      daysAgo: 40,
      reporter: "sarah@northstar.example",
      investigators: ["liam@northstar.example"],
      narrative: "A forklift reversed across the marked crossing while a pedestrian was waiting.",
      people: [WITNESS("Sarah O'Connor")],
      investigation: {
        status: "COMPLETED",
        investigator: "liam@northstar.example",
        findings: "Crossing layout allows pedestrians into the reversing zone.",
        rootCause: "Barrier layout does not separate the routes.",
        causes: [["WORKPLACE", "Unsafe layout"]],
        hazardGroup: "Workplace transport",
        actionsRequired: true,
        closingDecision: "Re-design the crossing barriers.",
      },
    },
    {
      key: "gate",
      title: "Pedestrian crossing near-miss at gate",
      type: "Near Miss",
      subtype: "RTA",
      severity: "MAJOR",
      department: "Third Parties",
      preciseLocation: "Gate 1 crossing",
      daysAgo: 35,
      reporter: "john@northstar.example",
      investigators: ["liam@northstar.example"],
      narrative: "A lorry passed close to a pedestrian at the gate crossing.",
      people: [WITNESS("John Murphy")],
      investigation: {
        status: "COMPLETED",
        investigator: "liam@northstar.example",
        findings: "Same crossing layout issue as the forklift observation.",
        rootCause: "Barrier layout does not separate the routes.",
        causes: [["WORKPLACE", "Unsafe layout"]],
        hazardGroup: "Workplace transport",
        actionsRequired: true,
        closingDecision: "Share the crossing re-design action.",
      },
    },
    {
      key: "hand-cut",
      title: "Hand cut during maintenance",
      type: "Accident",
      subtype: "First Aid",
      severity: "MINOR",
      department: "Engineering",
      preciseLocation: "Maintenance bay",
      daysAgo: 25,
      reporter: "priya@northstar.example",
      investigators: ["sam@northstar.example"],
      narrative: "A technician cut their hand on a sharp panel edge.",
      firstAid: "Cleaned and dressed by the first aider; returned to duties.",
      people: [{ name: "Priya Shah", personType: "EMPLOYEE", involvement: "INJURED", injuryDetails: "Minor cut to left hand", injuryType: "Cut or laceration", bodyPart: "Hand or finger" }],
      investigation: {
        status: "COMPLETED",
        investigator: "sam@northstar.example",
        findings: "Cut-resistant gloves were not worn.",
        rootCause: "Gloves not available at the bay.",
        causes: [["PEOPLE", "PPE not used"]],
        hazardGroup: "Work equipment",
        actionsRequired: true,
        closingDecision: "Stock gloves at every maintenance bay.",
      },
    },
    {
      key: "closed",
      title: "Damaged racking upright",
      type: "Dangerous Occurrence",
      subtype: "Collapse of building or structure",
      severity: "MAJOR",
      department: "Third Parties",
      preciseLocation: "Racking row C",
      daysAgo: 60,
      reporter: "sarah@northstar.example",
      investigators: ["liam@northstar.example"],
      narrative: "A racking upright was struck and bent; the bay was offloaded.",
      people: [WITNESS("Sarah O'Connor")],
      closed: { note: "All corrective work verified", by: "emma@northstar.example", daysAgo: 8 },
      investigation: {
        status: "COMPLETED",
        investigator: "liam@northstar.example",
        findings: "Upright struck by a reach truck.",
        rootCause: "No upright protectors on row C.",
        causes: [["EQUIPMENT", "Inadequate guarding"]],
        hazardGroup: "Work equipment",
        actionsRequired: true,
        closingDecision: "Replace upright and fit protectors.",
      },
    },
    {
      key: "complaint",
      title: "Canteen hygiene complaint",
      type: "Complaint",
      subtype: "Bad smell/odour",
      severity: "MINOR",
      department: "Port Central Management & Admin",
      preciseLocation: "Canteen",
      daysAgo: 4,
      reporter: "admin@northstar.example",
      investigators: ["emma@northstar.example"],
      narrative: "Employees reported unclean tables at lunch time.",
      people: [WITNESS("Alex Morgan")],
    },
    {
      key: "archived",
      title: "Duplicate report – oil spill",
      type: "Incident",
      subtype: "Spills",
      severity: "MINOR",
      department: "Operations",
      preciseLocation: "Press line 2",
      daysAgo: 20,
      reporter: "priya@northstar.example",
      investigators: ["sam@northstar.example"],
      narrative: "Duplicate of the hydraulic oil spill report.",
      people: [WITNESS("Priya Shah")],
      archived: true,
    },
  ],
  actions: [
    {
      key: "hose",
      description: "Replace hose and inspect hydraulic lines",
      incidents: ["spill"],
      owner: "sam@northstar.example",
      reviewer: "emma@northstar.example",
      department: "Operations",
      dueInDays: -2,
      priority: "HIGH",
      category: "Maintenance",
      state: "IN_PROGRESS",
      tasks: [
        { title: "Order replacement hose", owner: "priya@northstar.example", dueInDays: -5, done: "Hose ordered from the approved supplier." },
        { title: "Inspect all hydraulic lines on press line 2", owner: "priya@northstar.example", dueInDays: 3 },
      ],
    },
    {
      key: "drainage",
      description: "Improve wash station drainage",
      incidents: ["slip"],
      owner: "sam@northstar.example",
      reviewer: "admin@northstar.example",
      department: "Whole Site",
      dueInDays: -10,
      category: "Engineering control",
      state: "AWAITING_EFFECTIVENESS",
      reviewInDays: -1,
      completion: "Drain cleared and a weekly cleaning check added.",
      tasks: [{ title: "Clear and re-grade the drain", owner: "priya@northstar.example", dueInDays: -12, done: "Drain cleared and re-graded." }],
    },
    {
      key: "barriers",
      description: "Re-design the yard crossing barriers",
      incidents: ["forklift", "gate"],
      owner: "sarah@northstar.example",
      reviewer: "emma@northstar.example",
      department: "Third Parties",
      dueInDays: -20,
      category: "Engineering control",
      state: "INEFFECTIVE",
      reviewInDays: -5,
      completion: "New barriers installed.",
      review: "Barrier layout still allows crossing.",
    },
    {
      key: "barriers-follow-up",
      description: "Add a pedestrian gate interlock at the crossing",
      incidents: ["forklift", "gate"],
      owner: "liam@northstar.example",
      reviewer: "emma@northstar.example",
      department: "Third Parties",
      dueInDays: 10,
      priority: "HIGH",
      category: "Engineering control",
      state: "OPEN",
      parent: "barriers",
      tasks: [{ title: "Get quotes for interlocked gate", owner: "liam@northstar.example", dueInDays: 4 }],
    },
    {
      key: "gloves",
      description: "Stock cut-resistant gloves at every maintenance bay",
      incidents: ["hand-cut"],
      owner: "priya@northstar.example",
      reviewer: "sam@northstar.example",
      department: "Engineering",
      dueInDays: -15,
      category: "PPE",
      state: "EFFECTIVE",
      reviewInDays: -3,
      completion: "Gloves stocked and labelled at all bays.",
      review: "Checked in use; control is effective.",
    },
    {
      key: "racking",
      description: "Replace upright and fit protectors on row C",
      incidents: ["closed"],
      owner: "sarah@northstar.example",
      reviewer: "emma@northstar.example",
      department: "Third Parties",
      dueInDays: -40,
      category: "Engineering control",
      state: "EFFECTIVE",
      reviewInDays: -12,
      completion: "Upright replaced; protectors fitted.",
      review: "Inspected – protectors in place.",
    },
    {
      key: "trend",
      description: "Improve pre-use checks for vehicles and ladders",
      kind: "PREVENTIVE",
      incidents: ["open"],
      owner: "emma@northstar.example",
      reviewer: "admin@northstar.example",
      department: "Whole Site",
      dueInDays: 21,
      category: "Process improvement",
      state: "OPEN",
      trend: { typeKey: "near-miss", days: 45 },
    },
  ],
};

export const OLEO_DEMO_INCIDENTS: IncidentSeedSpec = {
  incidents: [
    {
      key: "trip",
      title: "Trip over a cable in the meeting room",
      type: "Near Miss",
      subtype: "Slips, Trips, Falls",
      severity: "MINOR",
      department: "Administration",
      preciseLocation: "Meeting room 1",
      daysAgo: 3,
      reporter: "jordan@oleo-demo.example",
      investigators: ["admin@oleo-demo.example"],
      narrative: "A projector cable ran across the walkway.",
      people: [WITNESS("Jordan Lee")],
    },
    {
      key: "kettle",
      title: "Kettle cable damaged",
      type: "Safety Comment",
      subtype: "Report a hazard",
      severity: "MINOR",
      department: "Administration",
      preciseLocation: "Kitchen",
      daysAgo: 15,
      reporter: "admin@oleo-demo.example",
      investigators: ["admin@oleo-demo.example"],
      narrative: "The kettle cable insulation was split.",
      people: [WITNESS("Morgan Kelly")],
      closed: { note: "Kettle replaced; no further action needed.", by: "admin@oleo-demo.example", daysAgo: 10 },
      investigation: {
        status: "COMPLETED",
        investigator: "admin@oleo-demo.example",
        findings: "Old kettle with worn cable.",
        rootCause: "No portable appliance checks.",
        causes: [["EQUIPMENT", "Defective equipment"]],
        hazardGroup: "Electrical",
        actionsRequired: false,
        closingDecision: "Replace the kettle.",
      },
    },
  ],
  actions: [],
};
