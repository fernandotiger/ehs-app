/**
 * The built-in Incident type catalogue (spec "Manual settings"). Seeded per tenant; administrators
 * change settings, form bindings and subtypes, rename types and add their own
 * (`incident-type.service.ts`). No `server-only`: the provisioning code and the seed import it with
 * their own (unscoped) client – every write passes organizationId explicitly.
 */
import type { PrismaClient } from "../../../generated/prisma/client";

export interface CatalogueType {
  key: string;
  name: string;
  subtypes: string[];
  isActive?: boolean;
  investigationEnabled?: boolean;
  investigationRequired?: boolean;
  defaultConfidential?: boolean;
  targetDays?: number;
}

/**
 * Types and subtypes from the Port of Cork incident templates ("Incident Fields As-Built",
 * 19/02/2021) – the demo set chosen by the product owner on 27 Oct 2026. Spelling slips in the
 * sheet are corrected. "Other" is not turned on.
 */
export const INCIDENT_TYPE_CATALOGUE: CatalogueType[] = [
  {
    key: "accident",
    name: "Accident",
    subtypes: ["3 Days Accident (Reportable)", "AED Used", "Damage", "First Aid", "Hypo", "Minor Injury"],
    defaultConfidential: true,
  },
  {
    key: "complaint",
    name: "Complaint",
    subtypes: ["Bad smell/odour", "Dust", "Light Pollution", "Litter/visual", "Marine", "Noise nuisance", "Traffic/pedestrian movement impact"],
    investigationRequired: false,
    targetDays: 14,
  },
  {
    key: "dangerous-occurrence",
    name: "Dangerous Occurrence",
    subtypes: [
      "Breathing Apparatus",
      "Bursting of Vessel, etc.",
      "Collapse of building or structure",
      "Collapse of scaffolding",
      "Conveyance of dangerous substances",
      "Electrical short circuit",
      "Escape of a substance",
      "Escape of a flammable substance",
      "Explosion or fire",
      "Freight containers",
    ],
  },
  { key: "inspection-finding", name: "Inspection Finding", subtypes: ["Audit Finding", "Issue raised at Safety Week", "Safety Committee Meetings", "WBV Monitoring"] },
  {
    key: "incident",
    name: "Incident",
    subtypes: ["Leaks", "Litter", "Not meeting internal monitoring limits", "Spills", "Release to air", "Unplanned release to effluent/sewer", "Wastage/inefficiency"],
  },
  {
    key: "near-miss",
    name: "Near Miss",
    subtypes: ["3rd Parties", "Behaviour", "Equipment", "Hazardous Goods", "Manual Handling", "Marine", "PPE", "RTA", "Slips, Trips, Falls", "Facilities"],
  },
  {
    key: "occupational-health",
    name: "Occupational Health",
    subtypes: ["Biological Hazard", "Pandemic e.g. coronavirus", "Hygiene", "Noise / Vibration", "Occupational Dust", "Threatening or Abusive Behaviour", "Vermin", "Welfare", "Fumes"],
    defaultConfidential: true,
  },
  { key: "safety-comment", name: "Safety Comment", subtypes: ["Good Catch", "Safety suggestion", "Report a hazard"], investigationRequired: false, targetDays: 14 },
  {
    key: "other",
    name: "Other",
    subtypes: ["Incident involving a member of the public", "Incident involving an employee not work related"],
    isActive: false,
    investigationRequired: false,
  },
];

/**
 * Stable keys used by cross-module follow-up routing. `audit-non-conformance` and
 * `non-compliance` are no longer in the built-in catalogue (Port of Cork demo set): the Audit and
 * Law phases must add those types or route to another one (the sheet files audit findings under
 * Inspection Finding → "Audit Finding"). The keys stay reserved.
 */
export const INCIDENT_TYPE_KEYS = {
  AUDIT_NON_CONFORMANCE: "audit-non-conformance",
  INSPECTION_FINDING: "inspection-finding",
  NON_COMPLIANCE: "non-compliance",
} as const;

/**
 * The catalogue before 27 Oct 2026: types and subtypes the demo seed retires (deleted when no
 * record uses them, otherwise switched off). Their keys stay reserved for added types.
 */
export const RETIRED_CATALOGUE = {
  types: ["non-compliance", "environmental-incident", "audit-non-conformance"],
  subtypes: {
    accident: ["First aid", "Lost time", "Reportable injury"],
    complaint: ["General"],
    "dangerous-occurrence": ["General"],
    "inspection-finding": ["General"],
    incident: ["General"],
    "near-miss": ["Vehicle movement", "Slip / trip", "Equipment"],
    "occupational-health": ["General"],
    "safety-comment": ["General"],
    other: ["General"],
  } as Record<string, string[]>,
};

type CatalogueDb = Pick<PrismaClient, "incidentType" | "incidentSubtype" | "formDefinition">;

const sameName = (name: string) => name.trim().replace(/\s+/g, " ").toLowerCase();

/**
 * Idempotent: creates missing types and their initial subtypes; existing types (and anything an
 * administrator changed) are left alone. A built-in type whose name a tenant already uses for its
 * own type is skipped. New types bind the tenant's first published Incident report /
 * investigation forms when they exist.
 */
export async function ensureIncidentCatalogue(db: CatalogueDb, organizationId: string): Promise<number> {
  const existing = await db.incidentType.findMany({ where: { organizationId }, select: { key: true, name: true } });
  const haveKeys = new Set(existing.map((t) => t.key));
  const haveNames = new Set(existing.map((t) => sameName(t.name)));
  const missing = INCIDENT_TYPE_CATALOGUE.filter((t) => !haveKeys.has(t.key) && !haveNames.has(sameName(t.name)));
  if (!missing.length) return 0;
  const [report, investigation] = await Promise.all(
    (["REPORT", "INVESTIGATION"] as const).map((purpose) =>
      db.formDefinition.findFirst({
        where: { organizationId, module: "incidents", purpose, currentVersionId: { not: null } },
        orderBy: { createdAt: "asc" },
        select: { id: true },
      }),
    ),
  );
  for (const spec of missing) {
    const index = INCIDENT_TYPE_CATALOGUE.indexOf(spec);
    const investigationEnabled = spec.investigationEnabled ?? true;
    const type = await db.incidentType.create({
      data: {
        organizationId,
        key: spec.key,
        name: spec.name,
        sortOrder: index,
        isActive: spec.isActive ?? true,
        investigationEnabled,
        investigationRequired: investigationEnabled && (spec.investigationRequired ?? true) && Boolean(investigation),
        defaultConfidential: spec.defaultConfidential ?? false,
        targetDays: spec.targetDays ?? 7,
        reportFormId: report?.id ?? null,
        investigationFormId: investigationEnabled ? (investigation?.id ?? null) : null,
      },
    });
    await db.incidentSubtype.createMany({
      data: spec.subtypes.map((name, i) => ({ organizationId, typeId: type.id, name, sortOrder: i })),
      skipDuplicates: true,
    });
  }
  return missing.length;
}
