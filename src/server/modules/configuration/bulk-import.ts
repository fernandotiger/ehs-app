/**
 * Company-configuration bulk import – pure CSV parsing and validation (no I/O, unit-tested).
 *
 * File format (the downloadable template): type,key,name,parent_key,email,permissions,notes
 *   - type: business_unit | site | location | department | role | user | category | template
 *   - key: unique per file; children refer to their parent's key in parent_key
 *   - parent_key: a key in this file (also a LATER row) or the name/code of ONE existing parent of
 *     the right kind (site → business unit, location → site, department → location, user → role)
 *   - permissions: role rows only, permission keys separated by semicolons
 * Everything is validated first; a file with any error applies nothing.
 */
import { isPermission } from "@/lib/permissions";

export const IMPORT_TYPES = ["business_unit", "site", "location", "department", "role", "user", "category", "template"] as const;
export type ImportType = (typeof IMPORT_TYPES)[number];

export const IMPORT_HEADERS = ["type", "key", "name", "parent_key", "email", "permissions", "notes"] as const;

/** Dependency order used when applying. */
export const APPLY_ORDER: readonly ImportType[] = IMPORT_TYPES;

export const PARENT_TYPE: Partial<Record<ImportType, Exclude<ImportType, "user">>> = {
  site: "business_unit",
  location: "site",
  department: "location",
  user: "role",
};

export const IMPORT_TYPE_LABELS: Record<ImportType, { one: string; many: string }> = {
  business_unit: { one: "business unit", many: "business units" },
  site: { one: "site", many: "sites" },
  location: { one: "location", many: "locations" },
  department: { one: "department", many: "departments" },
  role: { one: "role", many: "roles" },
  user: { one: "user", many: "users" },
  category: { one: "category", many: "categories" },
  template: { one: "template", many: "templates" },
};

export const IMPORT_TEMPLATE_CSV =
  [
    IMPORT_HEADERS.join(","),
    "business_unit,west-operations,West Operations,,,,Regional business unit",
    "site,galway-hub,Galway Service Hub,west-operations,,,",
    "location,office-wing,Office Wing,galway-hub,,,",
    "department,customer-support,Customer Support,office-wing,,,",
    "role,site-coordinator,Site Coordinator,,,risk.view;risk.create;incident.view,Coordinates site safety work",
    "user,jamie-lee,Jamie Lee,site-coordinator,jamie.lee@example.com,,",
    "category,training,Training,,,,",
    'template,equipment-checklist,"Equipment inspection checklist",,,,"Quoted values may contain commas, like this"',
  ].join("\r\n") + "\r\n";

export const DEFAULT_LIMITS = { maxBytes: 2 * 1024 * 1024, maxRows: 500 };

export interface ImportItem {
  line: number;
  type: ImportType;
  key: string;
  name: string;
  parentKey: string;
  email: string;
  permissions: string[];
  notes: string;
}

/** line 0 = the whole file. */
export interface ImportIssue {
  line: number;
  message: string;
}

export interface ExistingRecord {
  id: string;
  name: string;
  code?: string | null;
  /** Parent id (site → business unit, location → site, department → location). */
  parentId?: string | null;
  isActive?: boolean;
}

export interface ExistingData {
  business_unit: ExistingRecord[];
  site: ExistingRecord[];
  location: ExistingRecord[];
  department: ExistingRecord[];
  role: ExistingRecord[];
  category: ExistingRecord[];
  template: ExistingRecord[];
  /** Lower-case emails already used by someone (in any company – emails are global). */
  userEmails: ReadonlySet<string>;
}

export type ResolvedParent = { kind: "file"; key: string; line: number } | { kind: "existing"; id: string; name: string };

export interface ReviewRow extends ImportItem {
  parent: ResolvedParent | null;
  /** Human label for the review table, e.g. "Office Wing (this file, line 4)". */
  parentLabel: string | null;
}

export interface ImportReview {
  rows: ReviewRow[];
  issues: ImportIssue[];
  /** Rows per type. */
  counts: Record<ImportType, number>;
  valid: boolean;
}

const normal = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function emptyCounts(): Record<ImportType, number> {
  return Object.fromEntries(IMPORT_TYPES.map((t) => [t, 0])) as Record<ImportType, number>;
}

function isImportType(value: string): value is ImportType {
  return (IMPORT_TYPES as readonly string[]).includes(value);
}

// ── CSV ─────────────────────────────────────────────────────────────────────

export interface CsvRow {
  line: number;
  cells: string[];
}

/**
 * RFC-4180-style parser: commas, CRLF/LF, quoted cells with "" escapes and embedded line
 * breaks. Blank rows are skipped. Returns the starting line number of every row.
 */
export function parseCsv(text: string): { rows: CsvRow[]; error?: string } {
  const source = text.replace(/^﻿/, "");
  const rows: CsvRow[] = [];
  let cells: string[] = [];
  let cell = "";
  let quoted = false;
  let line = 1;
  let rowLine = 1;

  for (let index = 0; index < source.length; index++) {
    const char = source[index]!;
    if (char === '"') {
      if (quoted && source[index + 1] === '"') {
        cell += '"';
        index++;
      } else if (!quoted && cell.trim() === "") {
        quoted = true;
        cell = "";
      } else if (quoted) {
        quoted = false;
      } else {
        return { rows: [], error: `Unexpected quotation mark on line ${line}. Put values containing quotes inside quotation marks and double the inner quotes ("").` };
      }
    } else if (char === "," && !quoted) {
      cells.push(cell.trim());
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      cells.push(cell.trim());
      if (cells.some((value) => value !== "")) rows.push({ line: rowLine, cells });
      cells = [];
      cell = "";
      if (char === "\r" && source[index + 1] === "\n") index++;
      line++;
      rowLine = line;
    } else {
      cell += char;
      if (char === "\n") line++;
    }
  }
  if (quoted) return { rows: [], error: `A quoted value starting on line ${rowLine} is never closed.` };
  cells.push(cell.trim());
  if (cells.some((value) => value !== "")) rows.push({ line: rowLine, cells });
  return { rows };
}

// ── Reading rows ────────────────────────────────────────────────────────────

/** File-level and per-row checks that need no existing data. */
export function readImportFile(content: string, limits = DEFAULT_LIMITS): { items: ImportItem[]; issues: ImportIssue[] } {
  const bytes = new TextEncoder().encode(content).byteLength;
  if (bytes > limits.maxBytes) {
    return { items: [], issues: [{ line: 0, message: `The file is larger than ${Math.round(limits.maxBytes / 1024 / 1024)} MB.` }] };
  }
  const parsed = parseCsv(content);
  if (parsed.error) return { items: [], issues: [{ line: 0, message: parsed.error }] };
  if (parsed.rows.length === 0) return { items: [], issues: [{ line: 0, message: "The file is empty." }] };

  const header = parsed.rows[0]!.cells.map(normal);
  const missing = IMPORT_HEADERS.filter((name) => !header.includes(name));
  if (missing.length) {
    return {
      items: [],
      issues: [{ line: parsed.rows[0]!.line, message: `Missing column${missing.length === 1 ? "" : "s"}: ${missing.join(", ")}. Download the template to see the required headings.` }],
    };
  }
  const body = parsed.rows.slice(1);
  if (body.length === 0) return { items: [], issues: [{ line: 0, message: "The file has headings but no data rows." }] };
  if (body.length > limits.maxRows) {
    return { items: [], issues: [{ line: 0, message: `The file has ${body.length} data rows. The limit is ${limits.maxRows} per file – split it into smaller files.` }] };
  }

  const column = (row: CsvRow, name: (typeof IMPORT_HEADERS)[number]) => row.cells[header.indexOf(name)]?.trim() ?? "";
  const items: ImportItem[] = [];
  const issues: ImportIssue[] = [];
  const keys = new Map<string, number>();

  for (const row of body) {
    const rawType = column(row, "type");
    const type = normal(rawType).replace(/[\s-]+/g, "_");
    const key = column(row, "key");
    const name = column(row, "name").replace(/\s+/g, " ");
    const parentKey = column(row, "parent_key");
    const email = column(row, "email").toLowerCase();
    const permissions = column(row, "permissions")
      .split(";")
      .map((p) => p.trim())
      .filter(Boolean);
    const notes = column(row, "notes");
    const add = (message: string) => issues.push({ line: row.line, message });
    let ok = true;

    if (!isImportType(type)) {
      add(rawType ? `Unknown type "${rawType}". Use one of: ${IMPORT_TYPES.join(", ")}.` : "The type is missing.");
      ok = false;
    }
    if (!key) {
      add("A key is required.");
      ok = false;
    } else if (key.length > 80) {
      add("The key is longer than 80 characters.");
      ok = false;
    }
    if (!name) {
      add("A name is required.");
      ok = false;
    } else if (name.length > 120) {
      add("The name is longer than 120 characters.");
      ok = false;
    }
    if (key) {
      const first = keys.get(normal(key));
      if (first !== undefined) {
        add(`Key "${key}" is already used on line ${first}. Every row needs its own key.`);
        ok = false;
      } else {
        keys.set(normal(key), row.line);
      }
    }
    if (!ok || !isImportType(type)) continue;

    const label = IMPORT_TYPE_LABELS[type].one;
    const parentType = PARENT_TYPE[type];
    if (parentType && !parentKey) {
      add(`A ${label} needs a parent_key (the key or name of its ${IMPORT_TYPE_LABELS[parentType].one}).`);
      ok = false;
    }
    if (!parentType && parentKey) {
      add(`parent_key is not used for a ${label} – leave it empty.`);
      ok = false;
    }
    if (type === "user") {
      if (!EMAIL.test(email)) {
        add(email ? `"${email}" is not a valid email address.` : "A user needs a valid email address.");
        ok = false;
      }
    } else if (email) {
      add("email is only used on user rows – leave it empty.");
      ok = false;
    }
    if (type === "role") {
      for (const permission of permissions) {
        if (!isPermission(permission)) {
          add(`Unknown permission "${permission}".`);
          ok = false;
        }
      }
    } else if (permissions.length) {
      add("Permissions can only be set on role rows.");
      ok = false;
    }
    if (notes.length > 2000) {
      add("Notes are longer than 2000 characters.");
      ok = false;
    }
    if (ok) items.push({ line: row.line, type, key, name, parentKey, email, permissions, notes });
  }
  return { items, issues };
}

// ── Validation against the file and existing data ───────────────────────────

/** Cross-row checks, parent resolution and conflicts with existing data. */
export function validateImport(read: { items: ImportItem[]; issues: ImportIssue[] }, existing: ExistingData): ImportReview {
  const issues = [...read.issues];
  const items = read.items;
  const byKey = new Map(items.map((item) => [normal(item.key), item]));
  const rows: ReviewRow[] = [];
  const names = new Map<string, number>();
  const emails = new Map<string, number>();

  for (const item of items) {
    const add = (message: string) => issues.push({ line: item.line, message });
    const label = IMPORT_TYPE_LABELS[item.type];

    // Repeated type + parent + name, and repeated user emails, inside the file.
    const signature = `${item.type}|${normal(item.parentKey)}|${normal(item.name)}`;
    const firstName = names.get(signature);
    if (firstName !== undefined) add(`"${item.name}" is repeated for the same ${item.parentKey ? "parent" : "type"} (first on line ${firstName}).`);
    else names.set(signature, item.line);
    if (item.type === "user") {
      const firstEmail = emails.get(item.email);
      if (firstEmail !== undefined) add(`Email ${item.email} is repeated in this file (first on line ${firstEmail}).`);
      else emails.set(item.email, item.line);
      if (existing.userEmails.has(item.email)) add(`A user with email ${item.email} already exists.`);
    }

    // Parent resolution.
    let parent: ResolvedParent | null = null;
    let parentLabel: string | null = null;
    const parentType = PARENT_TYPE[item.type];
    if (parentType && item.parentKey) {
      const parentLabelText = IMPORT_TYPE_LABELS[parentType].one;
      const inFile = byKey.get(normal(item.parentKey));
      if (inFile && inFile !== item) {
        if (inFile.type !== parentType) {
          add(`Parent "${item.parentKey}" is a ${IMPORT_TYPE_LABELS[inFile.type].one} (line ${inFile.line}) – a ${label.one} needs a ${parentLabelText}.`);
        } else {
          parent = { kind: "file", key: inFile.key, line: inFile.line };
          parentLabel = `${inFile.name} (this file, line ${inFile.line})`;
        }
      } else if (inFile === item) {
        add(`A ${label.one} cannot be its own parent.`);
      } else {
        const wanted = normal(item.parentKey);
        const matches = existing[parentType].filter(
          (row) => row.isActive !== false && (normal(row.name) === wanted || (row.code ? normal(row.code) === wanted : false)),
        );
        if (matches.length === 1) {
          parent = { kind: "existing", id: matches[0]!.id, name: matches[0]!.name };
          parentLabel = `${matches[0]!.name} (existing)`;
        } else if (matches.length > 1) {
          add(`Parent "${item.parentKey}" matches ${matches.length} existing ${IMPORT_TYPE_LABELS[parentType].many}. Use a key from this file or a unique code.`);
        } else {
          add(`Parent "${item.parentKey}" was not found. Use a key from this file or the name of one existing ${parentLabelText}.`);
        }
      }
    }

    // Conflicts with existing data.
    const name = normal(item.name);
    if (item.type === "business_unit" || item.type === "role" || item.type === "category" || item.type === "template") {
      if (existing[item.type].some((row) => normal(row.name) === name)) add(`A ${label.one} called "${item.name}" already exists.`);
    } else if (parent?.kind === "existing" && item.type !== "user") {
      const sibling = existing[item.type].some((row) => row.parentId === parent.id && normal(row.name) === name);
      if (sibling) add(`${parent.name} already has a ${label.one} called "${item.name}".`);
    }

    rows.push({ ...item, parent, parentLabel });
  }

  issues.sort((a, b) => a.line - b.line);
  const counts = emptyCounts();
  for (const row of rows) counts[row.type]++;
  return { rows, issues, counts, valid: issues.length === 0 && rows.length > 0 };
}

/** Read + validate in one go (what the review screen shows). */
export function inspectImportCsv(content: string, existing: ExistingData, limits = DEFAULT_LIMITS): ImportReview {
  return validateImport(readImportFile(content, limits), existing);
}

/** Emails mentioned on user rows (to look up existing accounts before validating). */
export function importEmails(items: ImportItem[]): string[] {
  return [...new Set(items.filter((i) => i.type === "user").map((i) => i.email))];
}

/** Rows grouped in dependency order for applying. */
export function applyPlan(rows: ReviewRow[]): ReviewRow[] {
  return APPLY_ORDER.flatMap((type) => rows.filter((row) => row.type === type));
}
