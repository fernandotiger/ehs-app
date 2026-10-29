import { describe, expect, it } from "vitest";
import type { FormFieldDefinition } from "@/lib/forms";
import { mergeSeedAnswers, orFresh, pickChanged, pickSeedAnswers, seedForPage, seedId, seedIds, seedInt, seedText, seedTextOrNull } from "./seed";

const fields: FormFieldDefinition[] = [
  { key: "spill", label: "Spill size", type: "text" },
  { key: "litres", label: "Litres", type: "number" },
  { key: "chemical", label: "Chemical", type: "select", options: [{ value: "diesel", label: "Diesel" }, { value: "oil", label: "Oil" }] },
  { key: "ppe", label: "PPE worn", type: "multiselect", options: [{ value: "gloves", label: "Gloves" }, { value: "boots", label: "Boots" }] },
  { key: "contained", label: "Contained", type: "boolean" },
  { key: "witness", label: "Witness", type: "person" },
  { key: "noticed", label: "Noticed on", type: "date" },
  { key: "photo", label: "Photo", type: "file" },
  { key: "section", label: "Details", type: "heading" },
];

describe("seedForPage (seed-key check)", () => {
  const snapshot = { title: "Spill" };

  it("gives the kept values to the create page they were kept on", () => {
    expect(seedForPage({ kind: "PAGE", url: "/incidents/new", snapshot }, "incident.report")).toEqual({ ok: true, seed: snapshot });
    expect(seedForPage({ kind: "PAGE", url: "/documents/manage/new", snapshot }, "document.new")).toEqual({ ok: true, seed: snapshot });
  });

  it("refuses values kept on another page, a search page or a website", () => {
    expect(seedForPage({ kind: "PAGE", url: "/actions/new", snapshot }, "incident.report")).toEqual({ ok: false, reason: "other-page" });
    expect(seedForPage({ kind: "PAGE", url: "/incidents/register?view=investigations", snapshot }, "incident.report")).toEqual({ ok: false, reason: "other-page" });
    expect(seedForPage({ kind: "EXTERNAL", url: "https://hsa.ie", snapshot }, "incident.report")).toEqual({ ok: false, reason: "other-page" });
  });

  it("reports a favourite without typed values as empty", () => {
    expect(seedForPage({ kind: "PAGE", url: "/incidents/new", snapshot: null }, "incident.report")).toEqual({ ok: false, reason: "empty" });
    expect(seedForPage({ kind: "PAGE", url: "/incidents/new", snapshot: {} }, "incident.report")).toEqual({ ok: false, reason: "empty" });
  });
});

describe("value readers", () => {
  it("keep usable values and fall back otherwise", () => {
    expect(seedText("abcdef", 3)).toBe("abc");
    expect(seedText(5, 3)).toBeUndefined();
    expect(seedTextOrNull(null, 10)).toBeNull();
    expect(seedTextOrNull("  ", 10)).toBeNull();
    expect(seedInt(7, 1, 10)).toBe(7);
    expect(seedInt(7.5, 1, 10)).toBeUndefined();
    expect(seedInt(0, 1, 10)).toBeUndefined();
  });

  it("checks ids against what exists now", () => {
    expect(seedId("dep1", ["dep1"])).toBe("dep1");
    expect(seedId("gone", ["dep1"])).toBeUndefined();
    expect(seedId(null, ["dep1"])).toBeNull();
    expect(seedId("../../api")).toBeUndefined();
    expect(seedIds(["a", "a", "gone", 3, "b"], 10, ["a", "b"])).toEqual(["a", "b"]);
  });

  it("orFresh keeps an explicit none, unlike ??", () => {
    expect(orFresh(null, "mine")).toBeNull();
    expect(orFresh(undefined, "mine")).toBe("mine");
  });
});

describe("pickChanged", () => {
  it("keeps only what differs from the fresh form", () => {
    const fresh = { title: "", priority: "NORMAL", tags: [] as string[] };
    expect(pickChanged({ title: "Ladder", priority: "NORMAL", tags: [] }, fresh, ["title", "priority", "tags"])).toEqual({ title: "Ladder" });
    expect(pickChanged(fresh, fresh, ["title", "priority", "tags"])).toEqual({});
  });
});

describe("answers", () => {
  const answers = {
    spill: "Small",
    litres: 20,
    chemical: "diesel",
    ppe: ["gloves", "boots"],
    contained: true,
    witness: "user1",
    noticed: "2026-10-28",
    photo: [{ uploadId: "up1", fileName: "spill.jpg" }],
    removed: "question no longer in the form",
  };

  it("pick keeps text and choice answers only – never files, dates or unknown questions", () => {
    expect(pickSeedAnswers(fields, answers)).toEqual({ spill: "Small", litres: 20, chemical: "diesel", ppe: ["gloves", "boots"], contained: true, witness: "user1" });
  });

  it("merge filters to the current questions and options", () => {
    const now: FormFieldDefinition[] = [
      { key: "spill", label: "Spill size", type: "textarea" },
      { key: "chemical", label: "Chemical", type: "select", options: [{ value: "oil", label: "Oil" }] },
      { key: "ppe", label: "PPE worn", type: "multiselect", options: [{ value: "boots", label: "Boots" }] },
      { key: "photo", label: "Photo", type: "file" },
    ];
    expect(mergeSeedAnswers(answers, now)).toEqual({ spill: "Small", ppe: ["boots"] });
  });

  it("merge without the questions keeps only text / choice shapes (file answers never come back)", () => {
    expect(mergeSeedAnswers({ a: "x", b: 2, c: false, d: ["x"], photo: [{ fileName: "spill.jpg" }], e: { uploadId: "u" }, f: "" })).toEqual({ a: "x", b: 2, c: false, d: ["x"] });
    expect(mergeSeedAnswers("nonsense")).toEqual({});
  });
});
