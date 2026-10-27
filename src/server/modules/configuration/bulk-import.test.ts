import { describe, expect, it } from "vitest";
import { applyPlan, IMPORT_HEADERS, IMPORT_TEMPLATE_CSV, inspectImportCsv, parseCsv, readImportFile, type ExistingData } from "./bulk-import";

const HEADER = IMPORT_HEADERS.join(",");

function existing(overrides: Partial<ExistingData> = {}): ExistingData {
  return {
    business_unit: [{ id: "bu-ops", name: "Operations" }],
    site: [
      { id: "site-dublin", name: "Dublin Plant", parentId: "bu-ops" },
      { id: "site-cork", name: "Cork Distribution", parentId: "bu-ops" },
    ],
    location: [
      { id: "loc-floor", name: "Production Floor", parentId: "site-dublin" },
      { id: "loc-warehouse", name: "Warehouse", parentId: "site-cork" },
    ],
    department: [{ id: "dep-eng", name: "Engineering", parentId: "loc-floor" }],
    role: [{ id: "role-admin", name: "Administrator" }],
    category: [{ id: "cat-hs", name: "Health & Safety" }],
    template: [],
    userEmails: new Set(["admin@northstar.example"]),
    ...overrides,
  };
}

const csv = (...rows: string[]) => [HEADER, ...rows].join("\n");

const messages = (content: string, data = existing()) => inspectImportCsv(content, data).issues.map((i) => `${i.line}: ${i.message}`);

describe("CSV parsing", () => {
  it("handles quoted cells with commas, escaped quotes and line breaks", () => {
    const { rows, error } = parseCsv('a,"b, c","say ""hi"""\r\n"multi\nline",x,y\n');
    expect(error).toBeUndefined();
    expect(rows).toEqual([
      { line: 1, cells: ["a", "b, c", 'say "hi"'] },
      { line: 2, cells: ["multi\nline", "x", "y"] },
    ]);
  });

  it("reports an unclosed quotation", () => {
    expect(parseCsv('a,"open\nb,c').error).toMatch(/never closed/);
  });

  it("skips blank lines but keeps line numbers", () => {
    const { rows } = parseCsv("a,b\n\n,\nc,d");
    expect(rows.map((r) => r.line)).toEqual([1, 4]);
  });
});

describe("file-level checks", () => {
  it("rejects an empty file and a header-only file", () => {
    expect(messages("")).toEqual(["0: The file is empty."]);
    expect(messages(HEADER + "\n")).toEqual(["0: The file has headings but no data rows."]);
  });

  it("rejects a file without the name column (C-08)", () => {
    const issues = messages("type,key,parent_key,email,permissions,notes\nbusiness_unit,a,,,,");
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatch(/Missing column: name/);
  });

  it("rejects more than 500 data rows (C-08)", () => {
    const rows = Array.from({ length: 501 }, (_, i) => `category,c${i},Category ${i},,,,`);
    expect(messages(csv(...rows))).toEqual(["0: The file has 501 data rows. The limit is 500 per file – split it into smaller files."]);
    expect(inspectImportCsv(csv(...rows.slice(0, 500)), existing()).valid).toBe(true);
  });

  it("rejects a file larger than 2 MB (C-08)", () => {
    const big = csv(`category,big,Big,,,,${"x".repeat(2 * 1024 * 1024)}`);
    expect(readImportFile(big).issues[0]!.message).toMatch(/larger than 2 MB/);
  });
});

describe("C-07 valid configuration import", () => {
  it("resolves a whole branch whose parents appear after their children", () => {
    const content = csv(
      "user,jamie,Jamie Lee,site-coordinator,Jamie.Lee@Example.test,,",
      "department,customer-support,Customer Support,office-wing,,,",
      "location,office-wing,Office Wing,galway-hub,,,",
      "site,galway-hub,Galway Service Hub,west-operations,,,",
      "business_unit,west-operations,West Operations,,,,",
      "role,site-coordinator,Site Coordinator,,,risk.view;forms.publish,",
    );
    const review = inspectImportCsv(content, existing());
    expect(review.issues).toEqual([]);
    expect(review.valid).toBe(true);
    expect(review.counts).toMatchObject({ business_unit: 1, site: 1, location: 1, department: 1, role: 1, user: 1, category: 0 });
    const user = review.rows.find((r) => r.type === "user")!;
    expect(user.email).toBe("jamie.lee@example.test");
    expect(user.parent).toEqual({ kind: "file", key: "site-coordinator", line: 7 });
    expect(applyPlan(review.rows).map((r) => r.type)).toEqual(["business_unit", "site", "location", "department", "role", "user"]);
  });

  it("uses one unambiguous existing parent by name (case-insensitive)", () => {
    const review = inspectImportCsv(csv("location,lab,Laboratory,dublin plant,,,", "department,qa,Quality,production floor,,,"), existing());
    expect(review.issues).toEqual([]);
    expect(review.rows[0]!.parent).toEqual({ kind: "existing", id: "site-dublin", name: "Dublin Plant" });
    expect(review.rows[1]!.parent).toEqual({ kind: "existing", id: "loc-floor", name: "Production Floor" });
  });

  it("accepts the downloadable template as-is", () => {
    expect(inspectImportCsv(IMPORT_TEMPLATE_CSV, existing()).issues).toEqual([]);
  });
});

describe("C-08 invalid configuration files", () => {
  it("rejects a repeated key", () => {
    const issues = messages(csv("category,dup,One,,,,", "category,DUP,Two,,,,"));
    expect(issues).toEqual(['3: Key "DUP" is already used on line 2. Every row needs its own key.']);
  });

  it("rejects two users with the same email", () => {
    const issues = messages(
      csv("role,r,Reader,,,,", "user,a,Ann,r,same@example.test,,", "user,b,Bob,r,SAME@example.test,,"),
    );
    expect(issues).toEqual(["4: Email same@example.test is repeated in this file (first on line 3)."]);
  });

  it("rejects a location whose parent is a role", () => {
    const issues = messages(csv("role,r,Reader,,,,", "location,l,Store,r,,,"));
    expect(issues).toEqual(['3: Parent "r" is a role (line 2) – a location needs a site.']);
  });

  it("rejects a department parent name that matches two existing locations", () => {
    const data = existing({
      location: [
        { id: "l1", name: "Warehouse", parentId: "site-dublin" },
        { id: "l2", name: "Warehouse", parentId: "site-cork" },
      ],
    });
    expect(messages(csv("department,d,Packing,Warehouse,,,"), data)).toEqual([
      '2: Parent "Warehouse" matches 2 existing locations. Use a key from this file or a unique code.',
    ]);
  });

  it("rejects unknown permissions and permissions on non-role rows", () => {
    expect(messages(csv("role,r,Reader,,,risk.view;risk.fly,"))).toEqual(['2: Unknown permission "risk.fly".']);
    expect(messages(csv("category,c,Cat,,,risk.view,"))).toEqual(["2: Permissions can only be set on role rows."]);
  });

  it("rejects unknown types, missing parents and invalid emails", () => {
    expect(messages(csv("team,t,Team,,,,", "site,s,Somewhere,,,,", "role,r,R,,,,", "user,u,U,r,not-an-email,,"))).toEqual([
      '2: Unknown type "team". Use one of: business_unit, site, location, department, role, user, category, template.',
      "3: A site needs a parent_key (the key or name of its business unit).",
      '5: "not-an-email" is not a valid email address.',
    ]);
  });

  it("rejects unknown parents", () => {
    expect(messages(csv("site,s,Somewhere,Nowhere Ltd,,,"))).toEqual([
      '2: Parent "Nowhere Ltd" was not found. Use a key from this file or the name of one existing business unit.',
    ]);
  });

  it("rejects conflicts with existing data", () => {
    expect(
      messages(
        csv(
          "business_unit,b,operations,,,,",
          "role,r,ADMINISTRATOR,,,,",
          "category,c,health & safety,,,,",
          "site,s,dublin plant,Operations,,,",
          "user,u,Alex,Administrator,admin@northstar.example,,",
        ),
      ),
    ).toEqual([
      '2: A business unit called "operations" already exists.',
      '3: A role called "ADMINISTRATOR" already exists.',
      '4: A category called "health & safety" already exists.',
      '5: Operations already has a site called "dublin plant".',
      "6: A user with email admin@northstar.example already exists.",
    ]);
  });

  it("rejects the same name twice under the same parent in the file", () => {
    expect(messages(csv("location,a,Store,Dublin Plant,,,", "location,b,store,dublin plant,,,"))).toEqual([
      '3: "store" is repeated for the same parent (first on line 2).',
    ]);
  });

  it("marks the review invalid when any row has an error (nothing is applied)", () => {
    const review = inspectImportCsv(csv("business_unit,ok,Fine Unit,,,,", "location,bad,Store,missing-site,,,"), existing());
    expect(review.valid).toBe(false);
    expect(review.rows).toHaveLength(2);
    expect(review.issues).toHaveLength(1);
  });
});
