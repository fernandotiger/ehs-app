import "server-only";
import { Prisma } from "@/generated/prisma/client";
import type { FormFieldDefinition } from "@/lib/forms";
import { parseStoredFormSchema } from "@/lib/forms/definition-schema";
import { normaliseLabel } from "@/lib/lookups";
import { PERMISSIONS } from "@/lib/permissions";
import type { IncidentTypeCreateInput, IncidentTypeUpdateInput } from "@/lib/validation/incidents";
import { diff, recordAudit } from "@/server/audit/audit-service";
import type { CurrentUser } from "@/server/auth/current-user";
import { prisma, type DbClient } from "@/server/db/client";
import type { RequestMeta } from "@/server/http/api-handler";
import { BusinessRuleError, ConflictError, NotFoundError, StaleVersionError, ValidationError } from "@/server/http/errors";
import { requireCompanyConfig } from "@/server/modules/configuration/config-access";
import { requireTenantId } from "@/server/tenancy/context";
import { ensureIncidentCatalogue } from "./catalogue";
import { cleanTypeName, typeKeyFor, typeNameClash, typeSettingsProblem } from "./type-rules";

/**
 * Incident types, their settings, form bindings and subtypes (Configuration → Incident settings).
 * The built-in catalogue is seeded per tenant; administrators can add their own types and rename
 * any type (the stable `key` never changes, incidents keep their snapshot label). Types are never
 * deleted – an unused one is switched off (`isActive`).
 */

const TYPE_ENTITY = "IncidentType";

export interface FormBindingDto {
  formId: string;
  name: string;
  versionId: string | null;
  version: number;
}

export interface IncidentSubtypeDto {
  id: string;
  name: string;
  isActive: boolean;
}

export interface IncidentTypeDto {
  id: string;
  key: string;
  name: string;
  isActive: boolean;
  multipleInvestigators: boolean;
  assignmentRequired: boolean;
  investigationEnabled: boolean;
  investigationRequired: boolean;
  defaultConfidential: boolean;
  attachmentsAllowed: boolean;
  targetDays: number;
  reportForm: FormBindingDto | null;
  investigationForm: FormBindingDto | null;
  subtypes: IncidentSubtypeDto[];
  version: number;
}

/** What the report wizard needs (cached on the device for offline reporting). */
export interface ReportSetupTypeDto extends IncidentTypeDto {
  /** Latest published version of the bound Report form (all sites – the client filters by site). */
  reportFormVersion: { versionId: string; version: number; name: string; fields: FormFieldDefinition[] } | null;
}

const typeInclude = { subtypes: { orderBy: [{ sortOrder: "asc" as const }, { name: "asc" as const }] } };

async function formBindings(db: DbClient, ids: (string | null)[]): Promise<Map<string, FormBindingDto & { module: string; purpose: string }>> {
  const unique = [...new Set(ids.filter((v): v is string => Boolean(v)))];
  if (!unique.length) return new Map();
  const forms = await db.formDefinition.findMany({ where: { id: { in: unique } }, select: { id: true, name: true, module: true, purpose: true, currentVersionId: true, currentVersion: true } });
  return new Map(forms.map((f) => [f.id, { formId: f.id, name: f.name, versionId: f.currentVersionId, version: f.currentVersion, module: f.module, purpose: f.purpose }]));
}

type TypeRow = Awaited<ReturnType<typeof loadTypes>>[number];

async function loadTypes(db: DbClient, where: { id?: string; isActive?: boolean } = {}) {
  return db.incidentType.findMany({ where, include: typeInclude, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
}

function toDto(row: TypeRow, forms: Map<string, FormBindingDto>): IncidentTypeDto {
  const binding = (id: string | null) => {
    const f = id ? forms.get(id) : undefined;
    return f ? { formId: f.formId, name: f.name, versionId: f.versionId, version: f.version } : null;
  };
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    isActive: row.isActive,
    multipleInvestigators: row.multipleInvestigators,
    assignmentRequired: row.assignmentRequired,
    investigationEnabled: row.investigationEnabled,
    investigationRequired: row.investigationRequired,
    defaultConfidential: row.defaultConfidential,
    attachmentsAllowed: row.attachmentsAllowed,
    targetDays: row.targetDays,
    reportForm: binding(row.reportFormId),
    investigationForm: binding(row.investigationFormId),
    subtypes: row.subtypes.map((s) => ({ id: s.id, name: s.name, isActive: s.isActive })),
    version: row.version,
  };
}

async function ensureCatalogue(): Promise<void> {
  const count = await prisma.incidentType.count();
  if (count === 0) await ensureIncidentCatalogue(prisma, requireTenantId());
}

/** A bound form must be a published Incident form of the right purpose. */
async function assertBinding(db: DbClient, formId: string | null, purpose: "REPORT" | "INVESTIGATION"): Promise<void> {
  if (!formId) return;
  const form = await db.formDefinition.findUnique({ where: { id: formId }, select: { module: true, purpose: true, currentVersionId: true } });
  const label = purpose === "REPORT" ? "Report" : "Investigation";
  if (!form || form.module !== "incidents" || form.purpose !== purpose) throw new ValidationError(`Choose an Incident ${label.toLowerCase()} form.`);
  if (!form.currentVersionId) throw new ValidationError(`The ${label.toLowerCase()} form has not been published yet – publish it in Form Builder first.`);
}

function assertUniqueName(name: string, types: { id: string; name: string; isActive: boolean }[], excludeId?: string): void {
  const clash = typeNameClash(name, types, excludeId);
  if (!clash) return;
  throw new ConflictError(clash.isActive ? `A type called "${clash.name}" already exists.` : `A type called "${clash.name}" already exists but is switched off – open it and make it active instead.`);
}

export const incidentTypeService = {
  async list(options: { includeInactive?: boolean } = {}): Promise<IncidentTypeDto[]> {
    await ensureCatalogue();
    const rows = await loadTypes(prisma, options.includeInactive ? {} : { isActive: true });
    const forms = await formBindings(prisma, rows.flatMap((r) => [r.reportFormId, r.investigationFormId]));
    return rows.map((r) => toDto(r, forms));
  },

  async get(id: string, db: DbClient = prisma): Promise<IncidentTypeDto> {
    const [row] = await loadTypes(db, { id });
    if (!row) throw new NotFoundError();
    const forms = await formBindings(db, [row.reportFormId, row.investigationFormId]);
    return toDto(row, forms);
  },

  /** Active types with active subtypes and the bound Report form's latest published questions. */
  async reportSetup(): Promise<ReportSetupTypeDto[]> {
    const types = await this.list();
    const versionIds = types.map((t) => t.reportForm?.versionId).filter((v): v is string => Boolean(v));
    const versions = versionIds.length ? await prisma.formVersion.findMany({ where: { id: { in: versionIds } } }) : [];
    const byId = new Map(versions.map((v) => [v.id, v]));
    return types.map((t) => {
      const v = t.reportForm?.versionId ? byId.get(t.reportForm.versionId) : undefined;
      return {
        ...t,
        subtypes: t.subtypes.filter((s) => s.isActive),
        reportFormVersion: v ? { versionId: v.id, version: v.version, name: v.name, fields: parseStoredFormSchema(v.fields) } : null,
      };
    });
  },

  /**
   * Adds a tenant's own type with one subtype. Settings start at the defaults; it is offered to
   * reporters straight away when a Report form is chosen, otherwise it is saved inactive.
   */
  async create(input: IncidentTypeCreateInput, user: CurrentUser, meta: RequestMeta): Promise<IncidentTypeDto> {
    requireCompanyConfig(user, PERMISSIONS.INCIDENT_CONFIGURE);
    await ensureCatalogue();
    const name = cleanTypeName(input.name);
    const subtype = cleanTypeName(input.subtype);
    try {
      return await prisma.$transaction(async (tx) => {
        const existing = await tx.incidentType.findMany({ select: { id: true, key: true, name: true, isActive: true, sortOrder: true } });
        assertUniqueName(name, existing);
        await assertBinding(tx, input.reportFormId, "REPORT");
        await assertBinding(tx, input.investigationFormId, "INVESTIGATION");
        const data = {
          isActive: Boolean(input.reportFormId),
          investigationEnabled: true,
          investigationRequired: Boolean(input.investigationFormId),
          reportFormId: input.reportFormId,
          investigationFormId: input.investigationFormId,
        };
        const problem = typeSettingsProblem(data);
        if (problem) throw new BusinessRuleError(problem.message, { blockers: problem.blockers });
        const key = typeKeyFor(name, existing.map((t) => t.key));
        const sortOrder = existing.reduce((max, t) => Math.max(max, t.sortOrder + 1), 0);
        const row = await tx.incidentType.create({ data: { organizationId: user.organizationId, key, name, sortOrder, ...data } });
        await tx.incidentSubtype.create({ data: { organizationId: user.organizationId, typeId: row.id, name: subtype, sortOrder: 0 } });
        await recordAudit({ entityType: TYPE_ENTITY, entityId: row.id, action: "INCIDENT_TYPE_CREATED", actor: user, changes: { name, key, subtype, ...data }, meta }, tx);
        return this.get(row.id, tx);
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new ConflictError(`A type called "${name}" already exists.`);
      throw error;
    }
  },

  async update(id: string, input: IncidentTypeUpdateInput, user: CurrentUser, meta: RequestMeta): Promise<IncidentTypeDto> {
    requireCompanyConfig(user, PERMISSIONS.INCIDENT_CONFIGURE);
    return prisma.$transaction(async (tx) => {
      const before = await tx.incidentType.findUnique({ where: { id } });
      if (!before) throw new NotFoundError();
      if (before.version !== input.expectedVersion) throw new StaleVersionError();
      const name = input.name === undefined ? before.name : cleanTypeName(input.name);
      if (name !== before.name) assertUniqueName(name, await tx.incidentType.findMany({ select: { id: true, name: true, isActive: true } }), id);
      await assertBinding(tx, input.reportFormId, "REPORT");
      const investigationFormId = input.investigationEnabled ? input.investigationFormId : null;
      await assertBinding(tx, investigationFormId, "INVESTIGATION");
      const problem = typeSettingsProblem({ isActive: input.isActive, reportFormId: input.reportFormId, investigationRequired: input.investigationRequired, investigationFormId });
      if (problem) throw new BusinessRuleError(problem.message, { blockers: problem.blockers });
      const data = {
        name,
        isActive: input.isActive,
        multipleInvestigators: input.multipleInvestigators,
        assignmentRequired: input.assignmentRequired,
        investigationEnabled: input.investigationEnabled,
        investigationRequired: input.investigationEnabled && input.investigationRequired,
        defaultConfidential: input.defaultConfidential,
        attachmentsAllowed: input.attachmentsAllowed,
        targetDays: input.targetDays,
        reportFormId: input.reportFormId,
        investigationFormId,
      };
      const updated = await tx.incidentType.updateMany({ where: { id, version: input.expectedVersion }, data: { ...data, version: { increment: 1 } } });
      if (updated.count !== 1) throw new StaleVersionError();
      await recordAudit({ entityType: TYPE_ENTITY, entityId: id, action: "INCIDENT_TYPE_UPDATED", actor: user, changes: diff(before, data), metadata: { name: before.name }, meta }, tx);
      return this.get(id, tx);
    });
  },

  async addSubtype(typeId: string, name: string, user: CurrentUser, meta: RequestMeta): Promise<IncidentTypeDto> {
    requireCompanyConfig(user, PERMISSIONS.INCIDENT_CONFIGURE);
    const clean = name.trim().replace(/\s+/g, " ");
    return prisma.$transaction(async (tx) => {
      const type = await tx.incidentType.findUnique({ where: { id: typeId }, include: { subtypes: true } });
      if (!type) throw new NotFoundError();
      if (type.subtypes.some((s) => normaliseLabel(s.name) === normaliseLabel(clean))) throw new ConflictError(`"${clean}" already exists under ${type.name}.`);
      const row = await tx.incidentSubtype.create({
        data: { organizationId: requireTenantId(), typeId, name: clean, sortOrder: type.subtypes.length },
      });
      await recordAudit({ entityType: TYPE_ENTITY, entityId: typeId, action: "INCIDENT_SUBTYPE_ADDED", actor: user, changes: { subtype: clean }, metadata: { subtypeId: row.id }, meta }, tx);
      return this.get(typeId, tx);
    });
  },

  /** Rename or (de)activate a subtype. Historical incidents keep their snapshot label; one active subtype must remain. */
  async updateSubtype(typeId: string, subtypeId: string, input: { name?: string; isActive?: boolean }, user: CurrentUser, meta: RequestMeta): Promise<IncidentTypeDto> {
    requireCompanyConfig(user, PERMISSIONS.INCIDENT_CONFIGURE);
    return prisma.$transaction(async (tx) => {
      const type = await tx.incidentType.findUnique({ where: { id: typeId }, include: { subtypes: true } });
      const subtype = type?.subtypes.find((s) => s.id === subtypeId);
      if (!type || !subtype) throw new NotFoundError();
      const data: { name?: string; isActive?: boolean } = {};
      if (input.name !== undefined) {
        const clean = input.name.trim().replace(/\s+/g, " ");
        if (type.subtypes.some((s) => s.id !== subtypeId && normaliseLabel(s.name) === normaliseLabel(clean))) throw new ConflictError(`"${clean}" already exists under ${type.name}.`);
        data.name = clean;
      }
      if (input.isActive !== undefined) {
        if (!input.isActive && subtype.isActive && type.subtypes.filter((s) => s.isActive).length <= 1) {
          throw new BusinessRuleError("Keep at least one active subtype.", { blockers: [`${type.name} needs at least one active subtype.`] });
        }
        data.isActive = input.isActive;
      }
      await tx.incidentSubtype.update({ where: { id: subtypeId }, data });
      await recordAudit(
        { entityType: TYPE_ENTITY, entityId: typeId, action: "INCIDENT_SUBTYPE_UPDATED", actor: user, changes: diff(subtype, data), metadata: { subtypeId }, meta },
        tx,
      );
      return this.get(typeId, tx);
    });
  },
};
