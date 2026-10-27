import type { PrismaClient } from "../../src/generated/prisma/client";
import { initialFields } from "../../src/lib/forms/catalog";
import { defaultFormSettings } from "../../src/lib/forms/settings";
import type { FormFieldDefinition } from "../../src/lib/forms/types";
import { normaliseLabel } from "../../src/lib/lookups";
import { ensureIncidentCatalogue, INCIDENT_TYPE_CATALOGUE, RETIRED_CATALOGUE } from "../../src/server/modules/incidents/catalogue";
import { publishSeedForm } from "./forms";

/**
 * Demo incident types: the built-in catalogue (Port of Cork types and subtypes) plus one Report and
 * one Investigation form per type, transcribed from "Port of Cork Incident Module Templates
 * 19022021.xlsx" (tabs "Incident Fields As-Built" and "Investigation Fields As-Built").
 *
 * Sheet rows that are standard incident controls are NOT repeated as questions (Form Builder
 * duplicate rule): type/subtype, Description (= Incident title), Occurred date & time, Description
 * free text (= What happened?), Severity, Department, Location, Exact location, Immediate action,
 * First aid outcome, Occupational health notified, People involved, Assigned to, Also notify,
 * Investigation target close date; Environmental / H&S impact, Basic cause types + Cause types
 * (= causes), Reportable, Reportable to, Number of days lost. Everything else is a question below.
 */

export type DemoPurpose = "REPORT" | "INVESTIGATION";

interface DemoQuestionnaire {
  /** Section heading from the sheet's investigation "Group" (placeholder "New Group" omitted). */
  heading?: string;
  questions: FormFieldDefinition[];
}

const text = (key: string, label: string): FormFieldDefinition => ({ key, label, type: "text" });
const longText = (key: string, label: string): FormFieldDefinition => ({ key, label, type: "textarea" });
const yesNo = (key: string, label: string): FormFieldDefinition => ({ key, label, type: "boolean" });

const causeDetails = longText("causeDetails", "Cause details");
const notifiedAt: FormFieldDefinition = { key: "notifiedAt", label: "Date & time of notification of accident/incident", type: "datetime" };
const areaOwner: FormFieldDefinition = { key: "areaOwner", label: "Area owner", type: "person" };
const capaCommunicated = yesNo("capaCommunicated", "Investigation of CAPAs communicated to area owner");
const areaComments = longText("areaComments", "Area comments (Risk/Law review)");
const fiveWhys: FormFieldDefinition = { key: "fiveWhys", label: "5 Why's", type: "textarea", helpText: "Ask why five times to reach the root cause." };
const rcaAttached = yesNo("rcaAttached", "Root cause analysis required & attached");

/** Per type key, in the sheet's column order. */
export const DEMO_INCIDENT_QUESTIONNAIRES: Record<string, Record<DemoPurpose, DemoQuestionnaire>> = {
  accident: {
    REPORT: {
      questions: [text("treatedAt", "Accident treated at"), yesNo("employeeDetained", "Was the employee detained?"), longText("workBeingDone", "Describe the work being done")],
    },
    INVESTIGATION: {
      heading: "Investigation of Accident/Incident",
      questions: [causeDetails, notifiedAt, areaOwner, capaCommunicated, areaComments, fiveWhys, rcaAttached],
    },
  },
  complaint: {
    REPORT: { questions: [text("complainantName", "Complainant name"), longText("complainantAddress", "Complainant address")] },
    INVESTIGATION: {
      questions: [
        causeDetails,
        notifiedAt,
        areaOwner,
        capaCommunicated,
        areaComments,
        longText("complainantFollowUp", "Details of follow-up with complainant"),
        longText("sourceCloseOut", "Details of follow-up to close out source of complaint"),
        fiveWhys,
        rcaAttached,
      ],
    },
  },
  "dangerous-occurrence": {
    REPORT: { questions: [] },
    INVESTIGATION: { questions: [causeDetails, notifiedAt, areaOwner, capaCommunicated, areaComments, rcaAttached, fiveWhys] },
  },
  "inspection-finding": {
    REPORT: { questions: [] },
    INVESTIGATION: { questions: [causeDetails, areaOwner, capaCommunicated, areaComments, fiveWhys, rcaAttached] },
  },
  incident: {
    REPORT: { questions: [] },
    INVESTIGATION: { questions: [causeDetails, areaOwner, capaCommunicated, areaComments, fiveWhys, rcaAttached] },
  },
  "near-miss": {
    REPORT: { questions: [text("plantInUse", "Plant / equipment in use")] },
    INVESTIGATION: { heading: "Investigation", questions: [causeDetails, areaOwner, capaCommunicated, areaComments, rcaAttached, fiveWhys] },
  },
  "occupational-health": {
    REPORT: { questions: [] },
    INVESTIGATION: { heading: "Occupational Health Issue", questions: [causeDetails, areaOwner, capaCommunicated, areaComments, rcaAttached, fiveWhys] },
  },
  "safety-comment": {
    REPORT: { questions: [] },
    INVESTIGATION: { heading: "Safety Comments Investigation", questions: [causeDetails, areaOwner, capaCommunicated, areaComments, rcaAttached] },
  },
  other: {
    REPORT: { questions: [] },
    INVESTIGATION: {
      // "Choose location of incident" and "Persons Involved" are the report's department and people.
      questions: [
        text("witnessedBy", "Accident witnessed by (name)"),
        longText("causeOfAccident", "Cause of accident"),
        longText("investigationOutcome", "Investigation outcome"),
        longText("recommendation", "Recommendation / suggested solution (if any)"),
      ],
    },
  },
};

const PURPOSE_LABEL: Record<DemoPurpose, string> = { REPORT: "Report", INVESTIGATION: "Investigation" };

/** "Accident · Report" – distinct from the older generic "Incident report" form. */
export function demoFormName(typeName: string, purpose: DemoPurpose): string {
  return `${typeName} · ${PURPOSE_LABEL[purpose]}`;
}

/** Full form design: mandatory questions first (the heading above them for investigations), then the sheet's questions. */
export function demoFormDesign(typeKey: string, purpose: DemoPurpose): { fields: FormFieldDefinition[]; settings: Record<string, unknown> } {
  const questionnaire = DEMO_INCIDENT_QUESTIONNAIRES[typeKey]?.[purpose] ?? { questions: [] };
  const settings = defaultFormSettings("incidents", purpose);
  const heading: FormFieldDefinition[] = questionnaire.heading ? [{ key: "groupHeading", label: questionnaire.heading, type: "heading" }] : [];
  return { fields: [...heading, ...initialFields("incidents", purpose, settings), ...questionnaire.questions], settings };
}

/** Names of the forms the old seed bound to every type; types still bound to them are re-bound. */
const GENERIC_FORM_NAMES = ["Incident report", "Incident investigation"];

export interface DemoTypesResult {
  formsCreated: number;
  subtypesAdded: number;
  subtypesRemoved: number;
  subtypesSwitchedOff: number;
  typesRemoved: string[];
  typesSwitchedOff: string[];
}

/**
 * Idempotent. Creates missing catalogue types, adds the sheet's subtypes, publishes the per-type
 * forms and binds them where a type has no form or still uses a generic seed form. Retired
 * catalogue types/subtypes are deleted when nothing uses them, otherwise switched off. Types and
 * subtypes an administrator added – and their settings – are left alone.
 */
export async function applyDemoIncidentTypes(db: PrismaClient, organizationId: string, publishedBy: { id: string; name: string } | null): Promise<DemoTypesResult> {
  const result: DemoTypesResult = { formsCreated: 0, subtypesAdded: 0, subtypesRemoved: 0, subtypesSwitchedOff: 0, typesRemoved: [], typesSwitchedOff: [] };
  await ensureIncidentCatalogue(db, organizationId);
  const types = await db.incidentType.findMany({ where: { organizationId }, include: { subtypes: true } });
  const generic = await db.formDefinition.findMany({ where: { organizationId, module: "incidents", name: { in: GENERIC_FORM_NAMES } }, select: { id: true } });
  const genericIds = new Set(generic.map((f) => f.id));
  // Trend snapshots on actions keep type/subtype ids in JSON.
  const trends = (await db.correctiveAction.findMany({ where: { organizationId }, select: { trend: true } })).map((a) => JSON.stringify(a.trend ?? null)).join("\n");
  const typeUsed = async (id: string) => trends.includes(id) || (await db.incident.count({ where: { typeId: id } })) > 0;
  const subtypeUsed = async (id: string) => trends.includes(id) || (await db.incident.count({ where: { subtypeId: id } })) > 0;

  for (const spec of INCIDENT_TYPE_CATALOGUE) {
    const type = types.find((t) => t.key === spec.key);
    if (!type) continue; // skipped by the catalogue: the tenant already uses the name for its own type
    const wanted = new Set(spec.subtypes.map(normaliseLabel));
    for (const [index, name] of spec.subtypes.entries()) {
      const row = type.subtypes.find((s) => normaliseLabel(s.name) === normaliseLabel(name));
      if (!row) {
        await db.incidentSubtype.create({ data: { organizationId, typeId: type.id, name, sortOrder: index } });
        result.subtypesAdded++;
      } else if (row.name !== name || row.sortOrder !== index || !row.isActive) {
        await db.incidentSubtype.update({ where: { id: row.id }, data: { name, sortOrder: index, isActive: true } });
      }
    }
    const retired = new Set((RETIRED_CATALOGUE.subtypes[spec.key] ?? []).map(normaliseLabel));
    for (const row of type.subtypes.filter((s) => retired.has(normaliseLabel(s.name)) && !wanted.has(normaliseLabel(s.name)))) {
      if (await subtypeUsed(row.id)) {
        if (row.isActive) {
          await db.incidentSubtype.update({ where: { id: row.id }, data: { isActive: false, sortOrder: spec.subtypes.length + row.sortOrder } });
          result.subtypesSwitchedOff++;
        }
      } else {
        await db.incidentSubtype.delete({ where: { id: row.id } });
        result.subtypesRemoved++;
      }
    }

    const forms: Record<DemoPurpose, string> = { REPORT: "", INVESTIGATION: "" };
    for (const purpose of ["REPORT", "INVESTIGATION"] as const) {
      const design = demoFormDesign(spec.key, purpose);
      const form = await publishSeedForm(db, organizationId, { name: demoFormName(spec.name, purpose), module: "incidents", purpose, ...design }, publishedBy);
      forms[purpose] = form.id;
      if (form.created) result.formsCreated++;
    }
    const rebind = (formId: string | null) => !formId || genericIds.has(formId);
    const data: { reportFormId?: string; investigationFormId?: string; investigationEnabled?: boolean; investigationRequired?: boolean } = {};
    if (rebind(type.reportFormId)) data.reportFormId = forms.REPORT;
    if (rebind(type.investigationFormId)) {
      data.investigationFormId = forms.INVESTIGATION;
      data.investigationEnabled = true;
      if (!type.investigationFormId) data.investigationRequired = spec.investigationRequired ?? true;
    }
    if (Object.keys(data).length) await db.incidentType.update({ where: { id: type.id }, data: { ...data, version: { increment: 1 } } });
  }

  for (const key of RETIRED_CATALOGUE.types) {
    const type = types.find((t) => t.key === key);
    if (!type) continue;
    if (await typeUsed(type.id)) {
      if (type.isActive) {
        await db.incidentType.update({ where: { id: type.id }, data: { isActive: false, version: { increment: 1 } } });
        result.typesSwitchedOff.push(type.name);
      }
    } else {
      await db.incidentSubtype.deleteMany({ where: { typeId: type.id } });
      await db.incidentType.delete({ where: { id: type.id } });
      result.typesRemoved.push(type.name);
    }
  }
  return result;
}
