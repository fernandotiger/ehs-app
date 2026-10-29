import { describe, expect, it } from "vitest";
import { DEFAULT_JURISDICTIONS, SLAW_LIMITS } from "@/lib/simplified-law";
import { articleSchema, legislationSchema, questionSchema, requirementSchema } from "@/lib/validation/simplified-law";
import { SLAW_SEED_CATEGORIES, SLAW_SEED_LIBRARY } from "../../prisma/seed/simplified-law-library";

const OFFICIAL = /^https:\/\/(www\.)?(irishstatutebook\.ie|eur-lex\.europa\.eu)\//;
const GUIDANCE = /^https:\/\/(www\.)?(hsa\.ie|epa\.ie|gov\.ie|irishstatutebook\.ie|eur-lex\.europa\.eu)\//;

describe("Simplified law demo library", () => {
  it("has unique keys and every law sits in a known sub-category", () => {
    expect(new Set(SLAW_SEED_LIBRARY.map((i) => i.key)).size).toBe(SLAW_SEED_LIBRARY.length);
    const subs = new Set(SLAW_SEED_CATEGORIES.flatMap((c) => c.subCategories.map((s) => `${c.name}›${s.name}`)));
    for (const item of SLAW_SEED_LIBRARY) expect(subs.has(`${item.category}›${item.subCategory}`), item.key).toBe(true);
  });

  it("links to the official sources and uses the default jurisdictions", () => {
    for (const item of SLAW_SEED_LIBRARY) {
      expect(item.officialUrl, item.key).toMatch(OFFICIAL);
      if (item.guidanceUrl) expect(item.guidanceUrl, item.key).toMatch(GUIDANCE);
      expect(DEFAULT_JURISDICTIONS).toContain(item.jurisdiction);
    }
  });

  it("passes the same validation as a law typed in Configuration", () => {
    for (const item of SLAW_SEED_LIBRARY) {
      const law = legislationSchema.safeParse({ ...item, categoryId: "x" });
      expect(law.success, `${item.key}: ${law.error?.message}`).toBe(true);
      for (const a of item.articles) expect(articleSchema.safeParse(a).success, `${item.key} article ${a.number}`).toBe(true);
      for (const q of item.questions) expect(questionSchema.safeParse({ text: q }).success, `${item.key}: ${q}`).toBe(true);
      for (const r of item.requirements) expect(requirementSchema.safeParse(r).success, `${item.key}: ${r.text}`).toBe(true);
      expect(item.articles.every((a) => a.appliesTo.length <= SLAW_LIMITS.roles)).toBe(true);
    }
  });

  it("shows the storyboard's example sub-category with a repealed law", () => {
    const packaging = SLAW_SEED_LIBRARY.filter((i) => i.subCategory === "Packaging waste");
    expect(packaging.map((i) => i.reference)).toEqual(expect.arrayContaining(["Regulation (EU) 2025/40"]));
    expect(packaging.some((i) => i.status === "REPEALED")).toBe(true);
  });
});
