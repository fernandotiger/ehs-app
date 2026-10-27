import "server-only";
import { Prisma } from "@/generated/prisma/client";
import {
  copyQuestion,
  defaultFormSettings,
  enforceSystemQuestions,
  FORM_MODULES,
  formModule,
  initialFields,
  isFormPurpose,
  moduleLabel,
  parseStoredFormSchema,
  purposeLabel,
  questionCount,
  readRiskSettings,
  reusableQuestionChoices,
  riskFormSettingsSchema,
  structuralIssues,
  validateFormDesign,
  validateFormSettings,
  type DesignIssue,
  type FormFieldDefinition,
} from "@/lib/forms";
import { PERMISSIONS, type Permission } from "@/lib/permissions";
import type { FormCreateInput, FormDraftInput, FormPublishInput } from "@/lib/validation/forms";
import { recordAudit } from "@/server/audit/audit-service";
import { hasCompanyScope } from "@/server/auth/authorization";
import type { CurrentUser } from "@/server/auth/current-user";
import { prisma, type DbClient } from "@/server/db/client";
import type { RequestMeta } from "@/server/http/api-handler";
import { ConflictError, ForbiddenError, NotFoundError, StaleVersionError, ValidationError } from "@/server/http/errors";
import { cleanName } from "@/server/modules/configuration/config-access";

/**
 * Form Builder service. One editable draft per form (fields + settings on FormDefinition) and
 * immutable published versions (FormVersion). Publishing validates the module rules again on the
 * server (Incident duplicates, Risk thresholds, mandatory questions) – the designer is never trusted.
 *
 * A pending draft never takes the last published version out of use: modules keep offering the
 * latest published version until the next publication.
 */

export const FORM_ENTITY = "FormDefinition";
const P = PERMISSIONS;

export interface FormVersionMeta {
  id: string;
  version: number;
  publishedAt: string;
  publishedByName: string | null;
}

export interface FormSummaryDto {
  id: string;
  name: string;
  module: string;
  moduleLabel: string;
  purpose: string;
  purposeLabel: string;
  status: "DRAFT" | "PUBLISHED";
  /** Latest published version number (0 = never published). */
  currentVersion: number;
  currentVersionId: string | null;
  questionCount: number;
  publishedAt: string | null;
  updatedAt: string;
}

export interface FormDetailDto extends FormSummaryDto {
  fields: FormFieldDefinition[];
  settings: Record<string, unknown>;
  /** Optimistic concurrency token for the designer. */
  version: number;
  versions: FormVersionMeta[];
  /** What the signed-in user may do (company-wide configuration permissions). */
  access: { design: boolean; publish: boolean; rules: boolean };
}

export interface FormVersionDto {
  id: string;
  formId: string;
  version: number;
  name: string;
  module: string;
  purpose: string;
  fields: FormFieldDefinition[];
  settings: Record<string, unknown>;
  publishedAt: string;
  publishedByName: string | null;
}

export interface PublishedFormDto {
  formId: string;
  versionId: string;
  version: number;
  name: string;
  module: string;
  purpose: string;
  purposeLabel: string;
  questionCount: number;
  settings: Record<string, unknown>;
}

export interface ReusableQuestionDto {
  field: FormFieldDefinition;
  formId: string;
  formName: string;
  module: string;
  moduleLabel: string;
}

type FormRow = Prisma.FormDefinitionGetPayload<object>;
type VersionRow = Prisma.FormVersionGetPayload<object>;

function asSettings(value: Prisma.JsonValue | null | undefined): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

/** Key-order independent JSON (jsonb re-orders object keys). */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

function sameDesign(a: { fields: unknown; settings: unknown }, b: { fields: unknown; settings: unknown }): boolean {
  return stableStringify(a.fields) === stableStringify(b.fields) && stableStringify(a.settings) === stableStringify(b.settings);
}

function toSummary(row: FormRow): FormSummaryDto {
  return {
    id: row.id,
    name: row.name,
    module: row.module,
    moduleLabel: moduleLabel(row.module),
    purpose: row.purpose,
    purposeLabel: purposeLabel(row.module, row.purpose),
    status: row.status,
    currentVersion: row.currentVersion,
    currentVersionId: row.currentVersionId,
    questionCount: questionCount(parseStoredFormSchema(row.fields)),
    publishedAt: row.publishedAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toVersionDto(row: VersionRow): FormVersionDto {
  return {
    id: row.id,
    formId: row.formId,
    version: row.version,
    name: row.name,
    module: row.module,
    purpose: row.purpose,
    fields: parseStoredFormSchema(row.fields),
    settings: asSettings(row.settings),
    publishedAt: row.publishedAt.toISOString(),
    publishedByName: row.publishedByName,
  };
}

function can(user: CurrentUser, ...permissions: Permission[]): boolean {
  return permissions.some((p) => hasCompanyScope(user, p));
}

function require(user: CurrentUser, ...permissions: Permission[]): void {
  if (!can(user, ...permissions)) throw new ForbiddenError("Form Builder permissions apply only when assigned for the whole company.");
}

function accessFor(user: CurrentUser, row: FormRow) {
  const rulesPermissions: Permission[] = row.currentVersion > 0 ? [P.FORMS_PUBLISH, P.RISK_CONFIGURE] : [P.FORMS_DESIGN, P.RISK_CONFIGURE];
  return { design: can(user, P.FORMS_DESIGN), publish: can(user, P.FORMS_PUBLISH), rules: row.module === "risk" && can(user, ...rulesPermissions) };
}

async function toDetail(db: DbClient, row: FormRow, user: CurrentUser): Promise<FormDetailDto> {
  const versions = await db.formVersion.findMany({
    where: { formId: row.id },
    select: { id: true, version: true, publishedAt: true, publishedByName: true },
    orderBy: { version: "desc" },
  });
  return {
    ...toSummary(row),
    fields: parseStoredFormSchema(row.fields),
    settings: asSettings(row.settings),
    version: row.version,
    versions: versions.map((v) => ({ id: v.id, version: v.version, publishedAt: v.publishedAt.toISOString(), publishedByName: v.publishedByName })),
    access: accessFor(user, row),
  };
}

function issuesError(message: string, issues: DesignIssue[]): ValidationError {
  return new ValidationError(message, issues.map((i) => ({ path: i.path, message: i.message, fieldKey: i.fieldKey })));
}

/**
 * Canonical draft: system questions restored (labels, types, required, options), Risk method
 * fixed to the purpose. Structural or settings problems → 422 (the designer keeps its draft).
 */
function prepareDesign(row: Pick<FormRow, "module" | "purpose">, fields: FormFieldDefinition[], settings: Record<string, unknown>) {
  const normalisedSettings = row.module === "risk" ? { ...settings, method: row.purpose } : settings;
  const { fields: enforced } = enforceSystemQuestions(row.module, row.purpose, normalisedSettings, fields);
  const issues = [...structuralIssues(enforced), ...validateFormSettings(row.module, row.purpose, normalisedSettings)];
  if (issues.length) throw issuesError(issues.length === 1 ? issues[0]!.message : "The form could not be saved – fix the highlighted problems.", issues);
  return { fields: enforced, settings: normalisedSettings };
}

async function loadForm(db: DbClient, id: string): Promise<FormRow> {
  const row = await db.formDefinition.findUnique({ where: { id } });
  if (!row) throw new NotFoundError();
  return row;
}

async function assertUniqueName(db: DbClient, name: string, excludeId?: string) {
  const clash = await db.formDefinition.findFirst({
    where: { name: { equals: name, mode: "insensitive" }, ...(excludeId ? { id: { not: excludeId } } : {}) },
    select: { id: true },
  });
  if (clash) throw new ConflictError(`A form called "${name}" already exists.`);
}

async function statusFor(db: DbClient, row: Pick<FormRow, "currentVersionId">, design: { fields: unknown; settings: unknown }): Promise<"DRAFT" | "PUBLISHED"> {
  if (!row.currentVersionId) return "DRAFT";
  const published = await db.formVersion.findUnique({ where: { id: row.currentVersionId }, select: { fields: true, settings: true } });
  return published && sameDesign(design, published) ? "PUBLISHED" : "DRAFT";
}

async function createVersion(
  tx: DbClient,
  row: FormRow,
  design: { name: string; fields: FormFieldDefinition[]; settings: Record<string, unknown> },
  actor: CurrentUser,
): Promise<VersionRow> {
  return tx.formVersion.create({
    data: {
      organizationId: actor.organizationId,
      formId: row.id,
      version: row.currentVersion + 1,
      name: design.name,
      module: row.module,
      purpose: row.purpose,
      fields: toJson(design.fields),
      settings: toJson(design.settings),
      publishedById: actor.id,
      publishedByName: actor.name,
    },
  });
}

function stale(): StaleVersionError {
  return new StaleVersionError("This form was changed by someone else – reload to see their changes.");
}

export const formService = {
  // ── Library & designer ────────────────────────────────────────────────────

  async listLibrary(query: { q?: string; module?: string }): Promise<FormSummaryDto[]> {
    const q = query.q?.trim().toLowerCase();
    const modulesMatching = q ? Object.values(FORM_MODULES).filter((m) => m.label.toLowerCase().includes(q)).map((m) => m.key) : [];
    const rows = await prisma.formDefinition.findMany({
      where: {
        ...(query.module ? { module: query.module } : {}),
        ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, ...(modulesMatching.length ? [{ module: { in: modulesMatching } }] : [])] } : {}),
      },
      orderBy: [{ updatedAt: "desc" }],
    });
    return rows.map(toSummary);
  },

  async get(id: string, user: CurrentUser): Promise<FormDetailDto> {
    return toDetail(prisma, await loadForm(prisma, id), user);
  },

  /** New draft with the mandatory module questions (Risk and Incident in this phase). */
  async create(input: FormCreateInput, user: CurrentUser, meta: RequestMeta): Promise<FormDetailDto> {
    require(user, P.FORMS_DESIGN);
    const descriptor = formModule(input.module);
    if (!descriptor || !descriptor.available) {
      throw new ValidationError("Forms can be created for Risk and Incident. Audit, Inspection and Law forms come later.", [{ path: "module", message: "Choose Risk or Incident" }]);
    }
    if (!isFormPurpose(input.module, input.purpose)) {
      throw new ValidationError(`Choose a ${descriptor.purposeLabel.toLowerCase()}.`, [{ path: "purpose", message: `Choose a ${descriptor.purposeLabel.toLowerCase()}` }]);
    }
    const name = cleanName(input.name);
    const settings = defaultFormSettings(input.module, input.purpose, { domain: input.domain });
    const fields = initialFields(input.module, input.purpose, settings);
    try {
      return await prisma.$transaction(async (tx) => {
        await assertUniqueName(tx, name);
        const row = await tx.formDefinition.create({
          data: {
            organizationId: user.organizationId,
            name,
            module: input.module,
            purpose: input.purpose,
            fields: toJson(fields),
            settings: toJson(settings),
            createdById: user.id,
            updatedById: user.id,
          },
        });
        await recordAudit({ entityType: FORM_ENTITY, entityId: row.id, action: "CREATED", actor: user, changes: { name, module: input.module, purpose: input.purpose }, meta }, tx);
        return toDetail(tx, row, user);
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new ConflictError(`A form called "${name}" already exists.`);
      throw error;
    }
  },

  /** Saves the draft design (structure is checked; publication rules are checked on publish). */
  async saveDraft(id: string, input: FormDraftInput, user: CurrentUser, meta: RequestMeta): Promise<FormDetailDto> {
    require(user, P.FORMS_DESIGN);
    return prisma.$transaction(async (tx) => {
      const row = await loadForm(tx, id);
      if (row.version !== input.expectedVersion) throw stale();
      const design = prepareDesign(row, input.fields as FormFieldDefinition[], input.settings);
      const name = input.name !== undefined ? cleanName(input.name) : row.name;
      if (name.toLowerCase() !== row.name.toLowerCase()) await assertUniqueName(tx, name, id);
      const status = await statusFor(tx, row, design);
      const updated = await tx.formDefinition.updateMany({
        where: { id, version: input.expectedVersion },
        data: { name, fields: toJson(design.fields), settings: toJson(design.settings), status, updatedById: user.id, version: { increment: 1 } },
      });
      if (updated.count === 0) throw stale();
      await recordAudit(
        {
          entityType: FORM_ENTITY,
          entityId: id,
          action: "DRAFT_SAVED",
          actor: user,
          changes: { ...(name !== row.name ? { name: { from: row.name, to: name } } : {}), questions: questionCount(design.fields) },
          meta,
        },
        tx,
      );
      return toDetail(tx, await loadForm(tx, id), user);
    });
  },

  /** Publishes the draft as a new immutable version (version + 1). Re-validates every rule. */
  async publish(id: string, input: FormPublishInput, user: CurrentUser, meta: RequestMeta): Promise<FormDetailDto> {
    require(user, P.FORMS_PUBLISH);
    return prisma.$transaction(async (tx) => {
      const row = await loadForm(tx, id);
      if (row.version !== input.expectedVersion) throw stale();
      const draft = prepareDesign(
        row,
        (input.fields as FormFieldDefinition[] | undefined) ?? parseStoredFormSchema(row.fields),
        input.settings ?? asSettings(row.settings),
      );
      const name = input.name !== undefined ? cleanName(input.name) : row.name;
      if (name.toLowerCase() !== row.name.toLowerCase()) await assertUniqueName(tx, name, id);
      const issues = validateFormDesign({ module: row.module, purpose: row.purpose, ...draft }, { forPublish: true });
      if (issues.length) throw issuesError(issues.length === 1 ? issues[0]!.message : `Fix ${issues.length} problems before publishing.`, issues);

      const version = await createVersion(tx, row, { name, ...draft }, user);
      const updated = await tx.formDefinition.updateMany({
        where: { id, version: input.expectedVersion },
        data: {
          name,
          fields: toJson(draft.fields),
          settings: toJson(draft.settings),
          status: "PUBLISHED",
          currentVersion: version.version,
          currentVersionId: version.id,
          publishedAt: version.publishedAt,
          updatedById: user.id,
          version: { increment: 1 },
        },
      });
      if (updated.count === 0) throw stale();
      await recordAudit(
        { entityType: FORM_ENTITY, entityId: id, action: "PUBLISHED", actor: user, changes: { version: version.version, questions: questionCount(draft.fields) }, metadata: { versionId: version.id }, meta },
        tx,
      );
      return toDetail(tx, await loadForm(tx, id), user);
    });
  },

  /**
   * Risk matrix and review rules. On a form with a published version the rules are published at
   * once as a new version (with the published questions – pending question changes stay draft);
   * on a never-published form they are a draft change. Existing assessments keep their captured rules.
   */
  async saveRiskRules(id: string, input: { settings: Record<string, unknown>; expectedVersion: number }, user: CurrentUser, meta: RequestMeta): Promise<FormDetailDto> {
    return prisma.$transaction(async (tx) => {
      const row = await loadForm(tx, id);
      if (row.module !== "risk") throw new NotFoundError();
      const published = row.currentVersion > 0;
      require(user, ...(published ? [P.FORMS_PUBLISH, P.RISK_CONFIGURE] : [P.FORMS_DESIGN, P.RISK_CONFIGURE]));
      if (row.version !== input.expectedVersion) throw stale();
      const parsed = riskFormSettingsSchema.safeParse({ ...input.settings, method: row.purpose });
      if (!parsed.success) {
        throw new ValidationError(parsed.error.issues[0]?.message ?? "Check the rules", parsed.error.issues.map((i) => ({ path: ["settings", ...i.path].join("."), message: i.message })));
      }
      const settings = parsed.data as unknown as Record<string, unknown>;
      const draftFields = enforceSystemQuestions(row.module, row.purpose, settings, parseStoredFormSchema(row.fields)).fields;
      let versionRow: VersionRow | null = null;
      if (published && row.currentVersionId) {
        const current = await tx.formVersion.findUniqueOrThrow({ where: { id: row.currentVersionId } });
        const fields = enforceSystemQuestions(row.module, row.purpose, settings, parseStoredFormSchema(current.fields)).fields;
        versionRow = await createVersion(tx, row, { name: row.name, fields, settings }, user);
      }
      const status = versionRow ? (sameDesign({ fields: draftFields, settings }, { fields: versionRow.fields, settings: versionRow.settings }) ? "PUBLISHED" : "DRAFT") : "DRAFT";
      const updated = await tx.formDefinition.updateMany({
        where: { id, version: input.expectedVersion },
        data: {
          settings: toJson(settings),
          fields: toJson(draftFields),
          status,
          ...(versionRow ? { currentVersion: versionRow.version, currentVersionId: versionRow.id, publishedAt: versionRow.publishedAt } : {}),
          updatedById: user.id,
          version: { increment: 1 },
        },
      });
      if (updated.count === 0) throw stale();
      const before = readRiskSettings(row.settings);
      await recordAudit(
        {
          entityType: FORM_ENTITY,
          entityId: id,
          action: versionRow ? "RULES_PUBLISHED" : "RULES_SAVED",
          actor: user,
          changes: { rules: { from: before, to: settings }, ...(versionRow ? { version: versionRow.version } : {}) },
          meta,
        },
        tx,
      );
      return toDetail(tx, await loadForm(tx, id), user);
    });
  },

  /**
   * Custom questions from other forms whose name contains `q` – at most 10, identical
   * definitions shown once, with their origin form/module.
   */
  async reusableQuestions(q: string, excludeFormId: string | undefined): Promise<ReusableQuestionDto[]> {
    if (!q.trim()) return [];
    const rows = await prisma.formDefinition.findMany({ select: { id: true, name: true, module: true, fields: true }, orderBy: { updatedAt: "desc" }, take: 500 });
    const choices = reusableQuestionChoices(
      rows.map((r) => ({ id: r.id, name: r.name, module: r.module, fields: parseStoredFormSchema(r.fields) })),
      q,
      { excludeFormId },
    );
    return choices.map((c) => ({ field: copyQuestion(c.field, c.field.key), formId: c.formId, formName: c.formName, module: c.module, moduleLabel: moduleLabel(c.module) }));
  },

  // ── Module-facing contract ─────────────────────────────────────────────────

  /**
   * Compatible published forms for a workflow selector: module (+ purpose), latest published
   * version each. Risk forms restricted to other sites are left out when `siteId` is given.
   */
  async listPublished(module: string, purpose?: string, options: { siteId?: string } = {}): Promise<PublishedFormDto[]> {
    const forms = await prisma.formDefinition.findMany({
      where: { module, ...(purpose ? { purpose } : {}), currentVersionId: { not: null } },
      select: { currentVersionId: true },
      orderBy: { name: "asc" },
    });
    const ids = forms.map((f) => f.currentVersionId!);
    if (!ids.length) return [];
    const versions = await prisma.formVersion.findMany({ where: { id: { in: ids } } });
    const byId = new Map(versions.map((v) => [v.id, v]));
    return ids
      .map((vid) => byId.get(vid))
      .filter((v): v is VersionRow => Boolean(v))
      .filter((v) => formAvailableAtSite(asSettings(v.settings), options.siteId))
      .map((v) => ({
        formId: v.formId,
        versionId: v.id,
        version: v.version,
        name: v.name,
        module: v.module,
        purpose: v.purpose,
        purposeLabel: purposeLabel(v.module, v.purpose),
        questionCount: questionCount(parseStoredFormSchema(v.fields)),
        settings: asSettings(v.settings),
      }));
  },

  /** One immutable published version (404 when not in this tenant). */
  async getVersion(versionId: string): Promise<FormVersionDto> {
    const row = await prisma.formVersion.findUnique({ where: { id: versionId } });
    if (!row) throw new NotFoundError();
    return toVersionDto(row);
  },
};

/** Form-level site availability (Risk settings.siteIds; none = all sites). */
export function formAvailableAtSite(settings: Record<string, unknown>, siteId: string | undefined | null): boolean {
  const siteIds = Array.isArray(settings.siteIds) ? (settings.siteIds as string[]) : [];
  return !siteId || siteIds.length === 0 || siteIds.includes(siteId);
}
