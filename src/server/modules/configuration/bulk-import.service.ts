import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { normalisePermissions, PERMISSIONS } from "@/lib/permissions";
import { IMPORT_MAX_BYTES, IMPORT_MAX_ROWS } from "@/lib/validation/configuration";
import { recordAudit } from "@/server/audit/audit-service";
import type { CurrentUser } from "@/server/auth/current-user";
import { prisma, systemPrisma, type DbClient } from "@/server/db/client";
import type { RequestMeta } from "@/server/http/api-handler";
import { ConflictError, ValidationError } from "@/server/http/errors";
import {
  applyPlan,
  importEmails,
  IMPORT_TYPES,
  readImportFile,
  validateImport,
  type ExistingData,
  type ImportReview,
  type ImportType,
  type ReviewRow,
} from "./bulk-import";
import { requireCompanyConfig } from "./config-access";
import { uniqueRoleKey } from "./role.service";

/**
 * Bulk import of company configuration. `review` validates the whole file against the tenant's
 * data; `apply` validates again (never trusting an earlier review) and creates every row in
 * dependency order inside ONE transaction – any error means nothing is applied. Imported users
 * are directory entries (no sign-in) with a directory role reference; scoped access is granted
 * separately in Roles & permissions.
 */

const LIMITS = { maxBytes: IMPORT_MAX_BYTES, maxRows: IMPORT_MAX_ROWS };

export interface ImportResult {
  created: Record<ImportType, number>;
  total: number;
}

async function loadExisting(db: DbClient, emails: string[]): Promise<ExistingData> {
  const [bus, sites, locations, departments, roles, categories, templates, users] = await Promise.all([
    db.businessUnit.findMany({ select: { id: true, name: true, code: true, isActive: true } }),
    db.site.findMany({ select: { id: true, name: true, code: true, isActive: true, businessUnitId: true } }),
    db.location.findMany({ select: { id: true, name: true, code: true, isActive: true, siteId: true } }),
    db.department.findMany({ select: { id: true, name: true, code: true, isActive: true, locationId: true } }),
    db.role.findMany({ select: { id: true, name: true, key: true } }),
    db.lookupValue.findMany({ where: { listKey: "general.category" }, select: { id: true, label: true, code: true } }),
    db.lookupValue.findMany({ where: { listKey: "general.template" }, select: { id: true, label: true, code: true } }),
    // Emails are unique across ALL companies, so this check is global (no tenant data is returned).
    emails.length ? systemPrisma.user.findMany({ where: { email: { in: emails } }, select: { email: true } }) : [],
  ]);
  return {
    business_unit: bus,
    site: sites.map((s) => ({ ...s, parentId: s.businessUnitId })),
    location: locations.map((l) => ({ ...l, parentId: l.siteId })),
    department: departments.map((d) => ({ ...d, parentId: d.locationId })),
    role: roles.map((r) => ({ id: r.id, name: r.name, code: r.key })),
    category: categories.map((c) => ({ id: c.id, name: c.label, code: c.code })),
    template: templates.map((t) => ({ id: t.id, name: t.label, code: t.code })),
    userEmails: new Set(users.map((u) => u.email.toLowerCase())),
  };
}

async function review(content: string, db: DbClient = prisma): Promise<ImportReview> {
  const read = readImportFile(content, LIMITS);
  const existing = await loadExisting(db, importEmails(read.items));
  return validateImport(read, existing);
}

type Created = { id: string; ancestors: { businessUnitId?: string; siteId?: string; locationId?: string } };

export const bulkImportService = {
  async review(content: string, actor: CurrentUser): Promise<ImportReview> {
    requireCompanyConfig(actor, PERMISSIONS.CONFIG_BULK_IMPORT);
    return review(content);
  },

  async apply(content: string, fileName: string | undefined, actor: CurrentUser, meta: RequestMeta): Promise<ImportResult> {
    requireCompanyConfig(actor, PERMISSIONS.CONFIG_BULK_IMPORT);
    const result = await review(content);
    if (!result.valid) {
      throw new ValidationError(
        result.issues.length ? `The file has ${result.issues.length} problem${result.issues.length === 1 ? "" : "s"}. Nothing was imported.` : "The file has no rows to import.",
        result.issues.map((i) => ({ path: i.line ? `line ${i.line}` : "file", message: i.message })),
      );
    }
    const organizationId = actor.organizationId;
    const created = Object.fromEntries(IMPORT_TYPES.map((t) => [t, 0])) as Record<ImportType, number>;
    const byKey = new Map<string, Created>();
    const keyOf = (key: string) => key.trim().toLowerCase();
    const audit = (tx: DbClient, row: ReviewRow, entityType: string, entityId: string, changes: Record<string, unknown>) =>
      recordAudit({ entityType, entityId, action: "CREATED", actor, changes, metadata: { source: "bulk-import", line: row.line, fileName: fileName ?? null }, meta }, tx);

    try {
      await prisma.$transaction(
        async (tx) => {
          const parentOf = async (row: ReviewRow): Promise<Created> => {
            const parent = row.parent!;
            if (parent.kind === "file") return byKey.get(keyOf(parent.key))!;
            switch (row.type) {
              case "site":
                return { id: parent.id, ancestors: { businessUnitId: parent.id } };
              case "location": {
                const site = await tx.site.findUniqueOrThrow({ where: { id: parent.id } });
                return { id: site.id, ancestors: { businessUnitId: site.businessUnitId, siteId: site.id } };
              }
              case "department": {
                const loc = await tx.location.findUniqueOrThrow({ where: { id: parent.id } });
                return { id: loc.id, ancestors: { businessUnitId: loc.businessUnitId, siteId: loc.siteId, locationId: loc.id } };
              }
              default:
                return { id: parent.id, ancestors: {} };
            }
          };
          const nextSort = async (listKey: string) => ((await tx.lookupValue.aggregate({ where: { listKey }, _max: { sortOrder: true } }))._max.sortOrder ?? -1) + 1;
          const roleKeys = new Set<string>();

          for (const row of applyPlan(result.rows)) {
            const notes = row.notes || null;
            let id: string;
            let ancestors: Created["ancestors"] = {};
            switch (row.type) {
              case "business_unit":
                id = (await tx.businessUnit.create({ data: { organizationId, name: row.name, notes }, select: { id: true } })).id;
                ancestors = { businessUnitId: id };
                await audit(tx, row, "BusinessUnit", id, { name: row.name });
                break;
              case "site": {
                const p = await parentOf(row);
                id = (await tx.site.create({ data: { organizationId, name: row.name, notes, businessUnitId: p.id }, select: { id: true } })).id;
                ancestors = { businessUnitId: p.id, siteId: id };
                await audit(tx, row, "Site", id, { name: row.name, parentId: p.id });
                break;
              }
              case "location": {
                const p = await parentOf(row);
                const a = { businessUnitId: p.ancestors.businessUnitId!, siteId: p.id };
                id = (await tx.location.create({ data: { organizationId, name: row.name, notes, ...a }, select: { id: true } })).id;
                ancestors = { ...a, locationId: id };
                await audit(tx, row, "Location", id, { name: row.name, parentId: p.id });
                break;
              }
              case "department": {
                const p = await parentOf(row);
                const a = { businessUnitId: p.ancestors.businessUnitId!, siteId: p.ancestors.siteId!, locationId: p.id };
                id = (await tx.department.create({ data: { organizationId, name: row.name, notes, ...a }, select: { id: true } })).id;
                await audit(tx, row, "Department", id, { name: row.name, parentId: p.id });
                break;
              }
              case "role": {
                const key = await uniqueRoleKey(tx, row.name, roleKeys);
                roleKeys.add(key);
                const permissions = normalisePermissions(row.permissions);
                id = (await tx.role.create({ data: { organizationId, key, name: row.name, description: notes, permissions }, select: { id: true } })).id;
                await audit(tx, row, "Role", id, { name: row.name, permissions });
                break;
              }
              case "user": {
                const p = await parentOf(row);
                id = (
                  await tx.user.create({
                    data: { organizationId, name: row.name, email: row.email, emailVerified: false, directoryRoleId: p.id },
                    select: { id: true },
                  })
                ).id;
                await audit(tx, row, "User", id, { name: row.name, email: row.email, directoryRoleId: p.id, canSignIn: false });
                break;
              }
              case "category":
              case "template": {
                const listKey = row.type === "category" ? "general.category" : "general.template";
                id = (await tx.lookupValue.create({ data: { organizationId, listKey, label: row.name, notes, sortOrder: await nextSort(listKey) }, select: { id: true } })).id;
                await audit(tx, row, "LookupValue", id, { listKey, label: row.name });
                break;
              }
            }
            byKey.set(keyOf(row.key), { id, ancestors });
            created[row.type]++;
          }
          await recordAudit(
            {
              entityType: "BulkImport",
              entityId: `import-${Date.now()}`,
              action: "IMPORTED",
              actor,
              changes: { created },
              metadata: { fileName: fileName ?? null, rows: result.rows.length },
              meta,
            },
            tx,
          );
        },
        { timeout: 120_000, maxWait: 15_000 },
      );
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictError("Something in the file was created by someone else while importing. Review the file again – nothing was imported.");
      }
      throw error;
    }
    return { created, total: result.rows.length };
  },
};
