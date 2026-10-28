import { describe, expect, it } from "vitest";
import { applicableChecklists, changedChecklistIds, checklistApplies, contentChanges, mergeContent, validatePackage, versionRank, type LawContent } from "./content";
import { initialLawPackage, sampleLawPackage } from "./sample-content";

const q3 = initialLawPackage();
const library: LawContent = { legislation: q3.legislation, checklists: q3.checklists };
const installed = { version: "2026.Q3", content: library };
const ids = (items: { id: string }[]) => items.map((i) => i.id);

describe("L-01 profile applicability", () => {
  const cork = { jurisdiction: "Ireland", activities: ["Workplace operations", "Workplace transport"] };

  it("matches at least one activity with active legislation in the jurisdiction", () => {
    expect(ids(applicableChecklists(library, cork))).toEqual(["CL-001", "CL-006"]);
  });
  it("adding an activity brings its checklist in; it does not need every activity tag", () => {
    expect(ids(applicableChecklists(library, { ...cork, activities: [...cork.activities, "Chemicals"] }))).toEqual(["CL-001", "CL-003", "CL-006"]);
  });
  it("another jurisdiction or inactive legislation does not apply", () => {
    expect(applicableChecklists(library, { ...cork, jurisdiction: "France" })).toEqual([]);
    const inactive: LawContent = { ...library, legislation: library.legislation.map((l) => (l.id === "LEG-006" ? { ...l, active: false } : l)) };
    expect(checklistApplies(inactive.checklists.find((c) => c.id === "CL-003")!, { ...cork, activities: ["Chemicals"] }, inactive)).toBe(false);
  });
  it("an inactive checklist never applies", () => {
    const c = { ...library.checklists[0]!, active: false };
    expect(checklistApplies(c, cork, library)).toBe(false);
  });
});

describe("versions", () => {
  it("ranks YYYY.Qn and rejects anything else", () => {
    expect(versionRank("2026.Q4")).toBeGreaterThan(versionRank("2026.Q3"));
    expect(versionRank("2027.Q1")).toBeGreaterThan(versionRank("2026.Q4"));
    expect(versionRank("2026.Q5")).toBe(0);
    expect(versionRank("2026-Q1")).toBe(0);
  });
});

describe("L-05 install the sample update", () => {
  const check = validatePackage(sampleLawPackage(), installed);

  it("is valid and lists only new / amended items", () => {
    expect(check.ok).toBe(true);
    if (!check.ok) return;
    expect(check.changes.map((c) => `${c.change} ${c.id}`)).toEqual(["AMENDED LEG-003", "NEW LEG-007", "AMENDED CL-001", "NEW CL-005"]);
    expect(ids(check.next.checklists)).toEqual(["CL-001", "CL-002", "CL-003", "CL-004", "CL-006", "CL-005"]);
  });
  it("flags the amended transport checklist but not the unchanged machinery one", () => {
    if (!check.ok) throw new Error("invalid");
    const changed = changedChecklistIds(library, check.next);
    expect(changed.has("CL-001")).toBe(true);
    expect(changed.has("CL-002")).toBe(false);
    expect(changed.has("CL-005")).toBe(false); // new, nothing saved to review
  });
  it("a checklist whose referenced legislation changed is flagged too", () => {
    const next = mergeContent(library, { legislation: [{ ...library.legislation[1]!, synopsis: "Changed text" }], checklists: [] });
    expect([...changedChecklistIds(library, next)].sort()).toEqual(["CL-001", "CL-002"]);
  });
});

describe("L-07 invalid packages are rejected before anything is installed", () => {
  const problems = (raw: unknown, base = installed) => {
    const r = validatePackage(raw, base);
    return r.ok ? [] : r.problems;
  };
  const pkg = sampleLawPackage();

  it("same or older version", () => {
    expect(problems({ ...pkg, version: "2026.Q3" })[0]).toMatch(/not newer/);
    expect(problems({ ...pkg, version: "2026.Q2" })[0]).toMatch(/not newer/);
  });
  it("invalid release date or missing summary", () => {
    expect(problems({ ...pkg, released: "2026-02-30" })).toContain("Give a valid release date (yyyy-mm-dd).");
    expect(problems({ ...pkg, summary: " " })).toContain("Add a short summary of what changed.");
  });
  it("duplicate references", () => {
    expect(problems({ ...pkg, checklists: [pkg.checklists[1], pkg.checklists[1]] }).join(" ")).toMatch(/Duplicate checklist id CL-005/);
  });
  it("hierarchy errors and loops", () => {
    const secondaryUnderTertiary = { ...pkg.legislation[1]!, parentId: "LEG-003" };
    expect(problems({ ...pkg, legislation: [pkg.legislation[0], secondaryUnderTertiary] }).join(" ")).toMatch(/LEG-007: invalid place/);
    const primaryWithParent = { ...library.legislation[0]!, parentId: "LEG-004" };
    expect(problems({ ...pkg, legislation: [primaryWithParent] }).join(" ")).toMatch(/LEG-001: invalid place/);
    const a = { ...library.legislation[2]!, id: "LEG-A", level: "Tertiary", parentId: "LEG-B" };
    const b = { ...library.legislation[1]!, id: "LEG-B", level: "Secondary", parentId: "LEG-A" };
    expect(problems({ ...pkg, legislation: [a, b], checklists: [] }, installed).join(" ")).toMatch(/invalid place|loop/);
  });
  it("checklist referring to missing legislation", () => {
    const broken = { ...pkg.checklists[1]!, legislationIds: ["LEG-999"] };
    expect(problems({ ...pkg, checklists: [broken] }).join(" ")).toMatch(/CL-005: refers to legislation that does not exist \(LEG-999\)/);
  });
  it("unsupported source link, unknown activity or category", () => {
    expect(problems({ ...pkg, legislation: [{ ...pkg.legislation[1]!, sourceUrl: "javascript:alert(1)" }] }).join(" ")).toMatch(/http\(s\)/);
    expect(problems({ ...pkg, checklists: [{ ...pkg.checklists[1]!, activityKeys: ["Mining"] }] }).join(" ")).toMatch(/unknown activity "Mining"/);
    expect(problems({ ...pkg, checklists: [{ ...pkg.checklists[1]!, category: "Noise" }] }).join(" ")).toMatch(/unknown category "Noise"/);
  });
  it("not a package at all, or a package that changes nothing", () => {
    expect(problems([])).toEqual(["The file must contain one legal-content package (a JSON object)."]);
    expect(problems({ ...q3, version: "2026.Q4" })).toEqual(["This package changes nothing compared with the installed library."]);
  });
  it("the first library installs over an empty one", () => {
    const r = validatePackage(q3, null);
    expect(r.ok && r.changes.every((c) => c.change === "NEW")).toBe(true);
  });
});

describe("change list", () => {
  it("ignores unchanged items carried in a package", () => {
    expect(contentChanges(library, { legislation: [library.legislation[0]!], checklists: [library.checklists[1]!] })).toEqual([]);
  });
});
