import { z } from "zod";
import { isPermission } from "../permissions";
import { SCOPE_TYPES } from "../scope";
import { optionalId, optionalText, paginationQuerySchema } from "./common";

/**
 * Configuration module – zod schemas shared by the client forms and the API
 * (structure, users, roles & assignments, branding, company settings, bulk import).
 */

// ── Company structure ───────────────────────────────────────────────────────

export const STRUCTURE_LEVELS = ["business-units", "sites", "locations", "departments"] as const;
export type StructureLevel = (typeof STRUCTURE_LEVELS)[number];

export interface StructureLevelMeta {
  label: string;
  plural: string;
  /** Level of the required parent (null for business units). */
  parent: StructureLevel | null;
  /** Child level (null for departments). */
  child: StructureLevel | null;
  scopeType: "BUSINESS_UNIT" | "SITE" | "LOCATION" | "DEPARTMENT";
}

export const STRUCTURE_LEVEL_META: Record<StructureLevel, StructureLevelMeta> = {
  "business-units": { label: "Business unit", plural: "Business units", parent: null, child: "sites", scopeType: "BUSINESS_UNIT" },
  sites: { label: "Site", plural: "Sites", parent: "business-units", child: "locations", scopeType: "SITE" },
  locations: { label: "Location", plural: "Locations", parent: "sites", child: "departments", scopeType: "LOCATION" },
  departments: { label: "Department", plural: "Departments", parent: "locations", child: null, scopeType: "DEPARTMENT" },
};

export function isStructureLevel(value: string): value is StructureLevel {
  return (STRUCTURE_LEVELS as readonly string[]).includes(value);
}

export const structureNodeSchema = z.object({
  name: z.string().trim().min(1, "Enter a name").max(120),
  code: optionalText(40),
  notes: optionalText(2000),
  /** Required for sites, locations and departments (checked by the service per level). */
  parentId: optionalId,
});
export type StructureNodeInput = z.input<typeof structureNodeSchema>;
export type StructureNodeValues = z.output<typeof structureNodeSchema>;

export const structureListQuerySchema = paginationQuerySchema.extend({
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
  status: z.enum(["active", "inactive", "all"]).default("active"),
  parentId: z.string().trim().optional(),
});
export type StructureListQuery = z.infer<typeof structureListQuerySchema>;

export const activeSchema = z.object({ isActive: z.boolean() });

// ── Users ───────────────────────────────────────────────────────────────────

export const workEmail = z.string().trim().toLowerCase().max(254).email("Enter a valid work email");

const scopeFields = {
  scopeType: z.enum(SCOPE_TYPES),
  scopeId: optionalId,
};

function refineScope(value: { scopeType: string; scopeId: string | null }, ctx: z.RefinementCtx) {
  if (value.scopeType !== "COMPANY" && !value.scopeId) {
    ctx.addIssue({ code: "custom", path: ["scopeId"], message: "Choose where this role applies" });
  }
}

export const userCreateSchema = z
  .object({
    name: z.string().trim().min(1, "Enter the person's full name").max(120),
    email: workEmail,
    jobTitle: optionalText(120),
    departmentId: optionalId,
    managerId: optionalId,
    roleId: z.string().trim().min(1, "Choose an initial role"),
    ...scopeFields,
    /** "password": can sign in with a temporary password. "directory": listed and assignable only. */
    access: z.enum(["password", "directory"]),
    password: z.string().max(128).optional(),
  })
  .superRefine((value, ctx) => {
    refineScope(value, ctx);
    if (value.access === "password" && (value.password ?? "").length < 8) {
      ctx.addIssue({ code: "custom", path: ["password"], message: "Use at least 8 characters" });
    }
  });
export type UserCreateInput = z.input<typeof userCreateSchema>;
export type UserCreateValues = z.output<typeof userCreateSchema>;

export const userUpdateSchema = z.object({
  name: z.string().trim().min(1, "Enter the person's full name").max(120),
  email: workEmail,
  jobTitle: optionalText(120),
  departmentId: optionalId,
  managerId: optionalId,
});
export type UserUpdateInput = z.input<typeof userUpdateSchema>;
export type UserUpdateValues = z.output<typeof userUpdateSchema>;

export const passwordSchema = z.object({
  password: z.string().min(8, "Use at least 8 characters").max(128),
});

export const userListQuerySchema = paginationQuerySchema.extend({
  departmentId: z.string().trim().optional(),
  roleId: z.string().trim().optional(),
  status: z.enum(["active", "inactive", "all"]).default("active"),
});
export type UserListQuery = z.infer<typeof userListQuerySchema>;

// ── Roles & assignments ─────────────────────────────────────────────────────

export const roleCreateSchema = z.object({
  name: z.string().trim().min(1, "Enter a role name").max(80),
  description: optionalText(500),
});
export type RoleCreateInput = z.input<typeof roleCreateSchema>;

export const roleUpdateSchema = z.object({
  name: z.string().trim().min(1, "Enter a role name").max(80).optional(),
  description: optionalText(500).optional(),
  permissions: z
    .array(z.string())
    .max(500)
    .refine((list) => list.every(isPermission), "Unknown permission")
    .optional(),
  /** The version the editor loaded – a newer saved version is a conflict. */
  expectedVersion: z.number().int().min(1),
});
export type RoleUpdateInput = z.input<typeof roleUpdateSchema>;

export const assignmentCreateSchema = z
  .object({
    userId: z.string().trim().min(1, "Choose a person"),
    roleId: z.string().trim().min(1, "Choose a role"),
    ...scopeFields,
  })
  .superRefine(refineScope);
export type AssignmentCreateInput = z.input<typeof assignmentCreateSchema>;

export const ASSIGNMENT_PAGE_SIZE = 20;

export const assignmentListQuerySchema = paginationQuerySchema.extend({
  pageSize: z.coerce.number().int().min(1).max(100).default(ASSIGNMENT_PAGE_SIZE),
  roleId: z.string().trim().optional(),
  userId: z.string().trim().optional(),
  scopeType: z.enum(SCOPE_TYPES).optional(),
});
export type AssignmentListQuery = z.infer<typeof assignmentListQuerySchema>;

// ── Company settings, branding, versions ────────────────────────────────────

export const expectedVersionQuerySchema = z.object({
  expectedVersion: z.coerce.number().int().min(1).optional(),
});

/** Locales offered in System settings (dates and numbers). */
export const LOCALES = [
  { id: "en-IE", name: "English (Ireland)" },
  { id: "en-GB", name: "English (United Kingdom)" },
  { id: "en-US", name: "English (United States)" },
  { id: "de-DE", name: "Deutsch (Deutschland)" },
  { id: "fr-FR", name: "Français (France)" },
  { id: "es-ES", name: "Español (España)" },
  { id: "it-IT", name: "Italiano (Italia)" },
  { id: "nl-NL", name: "Nederlands (Nederland)" },
  { id: "pl-PL", name: "Polski (Polska)" },
  { id: "pt-PT", name: "Português (Portugal)" },
  { id: "pt-BR", name: "Português (Brasil)" },
] as const;

export function isValidTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export const companySettingsSchema = z.object({
  timeZone: z.string().trim().min(1).max(64).refine(isValidTimeZone, "Choose a valid time zone"),
  locale: z.enum(LOCALES.map((l) => l.id) as [string, ...string[]]),
  expectedVersion: z.number().int().min(1),
});
export type CompanySettingsInput = z.input<typeof companySettingsSchema>;

const hex = z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, "Use a six-digit colour like #18344A");

export const brandingUpdateSchema = z.object({
  name: z.string().trim().min(1, "Enter the company name").max(120),
  primary: hex,
  secondary: hex,
  tertiary: hex,
  expectedVersion: z.number().int().min(1),
});
export type BrandingUpdateInput = z.input<typeof brandingUpdateSchema>;

export const logoUploadSchema = z.object({ uploadId: z.string().min(1) });

/** Logo limits (also enforced by the upload purpose "branding-logo"). */
export const LOGO_MAX_BYTES = 2 * 1024 * 1024;
export const LOGO_MIME_TYPES = ["image/png", "image/jpeg", "image/svg+xml"] as const;

// ── Bulk import ─────────────────────────────────────────────────────────────

export const IMPORT_MAX_BYTES = 2 * 1024 * 1024;
export const IMPORT_MAX_ROWS = 500;

export const importRequestSchema = z.object({
  fileName: z.string().trim().max(255).optional(),
  content: z.string().max(IMPORT_MAX_BYTES + 1024),
});
