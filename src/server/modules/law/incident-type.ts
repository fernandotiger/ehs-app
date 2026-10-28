import type { PrismaClient } from "@/generated/prisma/client";
import { INCIDENT_TYPE_KEYS } from "@/server/modules/incidents/catalogue";

/**
 * The "Non Compliance" incident type that Law raises its incident drafts with (key
 * `non-compliance`, reserved by the Incident catalogue). The Port of Cork demo set no longer ships
 * it, so the Law module owns it: Configuration → Law content & settings sets it up (and the demo
 * seed does too). No server-only import – the seed uses it with an unscoped client.
 */

export const NON_COMPLIANCE_KEY = INCIDENT_TYPE_KEYS.NON_COMPLIANCE;
export const NON_COMPLIANCE_NAME = "Non Compliance";
export const NON_COMPLIANCE_SUBTYPES = { CONTENT: "Legal requirement", OTHER: "Other requirement" } as const;

type Db = Pick<PrismaClient, "incidentType" | "incidentSubtype" | "formDefinition">;

export interface NonComplianceReadiness {
  ready: boolean;
  /** What an administrator has to do, in plain words (null when ready). */
  problem: string | null;
  typeName: string | null;
  formName: string | null;
  /** Can be fixed with the one-click set-up (missing type, switched off, or no Report form bound). */
  fixable: boolean;
}

export async function nonComplianceReadiness(db: Db, organizationId: string): Promise<NonComplianceReadiness> {
  const type = await db.incidentType.findUnique({ where: { organizationId_key: { organizationId, key: NON_COMPLIANCE_KEY } }, include: { subtypes: true } });
  if (!type) return { ready: false, problem: `The incident type "${NON_COMPLIANCE_NAME}" is not set up yet.`, typeName: null, formName: null, fixable: true };
  const form = type.reportFormId ? await db.formDefinition.findUnique({ where: { id: type.reportFormId }, select: { name: true, currentVersionId: true } }) : null;
  if (!form?.currentVersionId) return { ready: false, problem: `"${type.name}" has no published Report form.`, typeName: type.name, formName: form?.name ?? null, fixable: true };
  if (!type.isActive) return { ready: false, problem: `The incident type "${type.name}" is switched off.`, typeName: type.name, formName: form.name, fixable: true };
  if (!type.subtypes.some((s) => s.isActive)) return { ready: false, problem: `"${type.name}" has no active subtype.`, typeName: type.name, formName: form.name, fixable: true };
  return { ready: true, problem: null, typeName: type.name, formName: form.name, fixable: false };
}

/** A published Incident Report form to bind: the generic "Incident report" when it exists, else the oldest. */
async function defaultReportForm(db: Db, organizationId: string): Promise<{ id: string; name: string } | null> {
  const published = { organizationId, module: "incidents", purpose: "REPORT", currentVersionId: { not: null } };
  return (
    (await db.formDefinition.findFirst({ where: { ...published, name: { equals: "Incident report", mode: "insensitive" } }, select: { id: true, name: true } })) ??
    (await db.formDefinition.findFirst({ where: published, orderBy: { createdAt: "asc" }, select: { id: true, name: true } }))
  );
}

/**
 * Idempotent set-up: creates the type (with subtypes "Legal requirement" / "Other requirement"),
 * binds a published Report form when none is bound, switches it on and re-activates a subtype.
 * Anything an administrator already chose (name, form, settings) is kept. Returns what changed.
 */
export async function ensureNonComplianceType(db: Db, organizationId: string): Promise<{ typeId: string; changes: string[] }> {
  const changes: string[] = [];
  let type = await db.incidentType.findUnique({ where: { organizationId_key: { organizationId, key: NON_COMPLIANCE_KEY } }, include: { subtypes: true } });
  const report = await defaultReportForm(db, organizationId);
  if (!type) {
    const investigation = await db.formDefinition.findFirst({
      where: { organizationId, module: "incidents", purpose: "INVESTIGATION", currentVersionId: { not: null } },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    const existing = await db.incidentType.findMany({ where: { organizationId }, select: { name: true, sortOrder: true } });
    const taken = existing.some((t) => t.name.trim().toLowerCase() === NON_COMPLIANCE_NAME.toLowerCase());
    const created = await db.incidentType.create({
      data: {
        organizationId,
        key: NON_COMPLIANCE_KEY,
        name: taken ? `${NON_COMPLIANCE_NAME} (Law)` : NON_COMPLIANCE_NAME,
        sortOrder: existing.reduce((max, t) => Math.max(max, t.sortOrder + 1), 0),
        isActive: Boolean(report),
        // Law drafts are completed by whoever raised them; an investigation is optional.
        assignmentRequired: false,
        investigationRequired: false,
        reportFormId: report?.id ?? null,
        investigationFormId: investigation?.id ?? null,
      },
    });
    await db.incidentSubtype.createMany({
      data: Object.values(NON_COMPLIANCE_SUBTYPES).map((name, i) => ({ organizationId, typeId: created.id, name, sortOrder: i })),
      skipDuplicates: true,
    });
    changes.push(`created "${created.name}"`);
    return { typeId: created.id, changes };
  }
  const data: { reportFormId?: string; isActive?: boolean } = {};
  const bound = type.reportFormId ? await db.formDefinition.findUnique({ where: { id: type.reportFormId }, select: { currentVersionId: true } }) : null;
  if (!bound?.currentVersionId && report) {
    data.reportFormId = report.id;
    changes.push(`bound the Report form "${report.name}"`);
  }
  if (!type.isActive && (bound?.currentVersionId || data.reportFormId)) {
    data.isActive = true;
    changes.push("switched it on");
  }
  if (Object.keys(data).length) type = await db.incidentType.update({ where: { id: type.id }, data: { ...data, version: { increment: 1 } }, include: { subtypes: true } });
  if (!type.subtypes.some((s) => s.isActive)) {
    const legal = type.subtypes.find((s) => s.name === NON_COMPLIANCE_SUBTYPES.CONTENT);
    if (legal) await db.incidentSubtype.update({ where: { id: legal.id }, data: { isActive: true } });
    else await db.incidentSubtype.create({ data: { organizationId, typeId: type.id, name: NON_COMPLIANCE_SUBTYPES.CONTENT, sortOrder: type.subtypes.length } });
    changes.push(`activated the subtype "${NON_COMPLIANCE_SUBTYPES.CONTENT}"`);
  }
  return { typeId: type.id, changes };
}
