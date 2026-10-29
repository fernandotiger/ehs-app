import { describe, expect, it } from "vitest";
import { createFavouriteSchema, moveFavouriteSchema, updateFavouriteSchema } from "./favourites";

describe("createFavouriteSchema", () => {
  it("accepts a page with optional icon, colour and typed details", () => {
    const page = createFavouriteSchema.parse({ kind: "PAGE", url: "/incidents/register?view=investigations", title: "  Investigations  ", icon: "Flame", color: "teal", snapshot: { title: "x" } });
    expect(page).toEqual({ kind: "PAGE", url: "/incidents/register?view=investigations", title: "Investigations", icon: "Flame", color: "teal", snapshot: { title: "x" } });
    expect(createFavouriteSchema.parse({ kind: "PAGE", url: "/actions", title: "A", color: "default" })).toMatchObject({ color: null });
    expect(createFavouriteSchema.parse({ kind: "PAGE", url: "/actions", title: "A", icon: null, color: null })).toMatchObject({ icon: null, color: null });
  });

  it("accepts a website and normalises its address", () => {
    expect(createFavouriteSchema.parse({ kind: "EXTERNAL", url: "www.hsa.ie", title: "HSA" })).toEqual({ kind: "EXTERNAL", url: "https://www.hsa.ie/", title: "HSA" });
  });

  it("refuses bad titles, icons, colours and addresses", () => {
    const base = { kind: "PAGE", url: "/actions", title: "Mine" };
    expect(createFavouriteSchema.safeParse({ ...base, title: "   " }).success).toBe(false);
    expect(createFavouriteSchema.safeParse({ ...base, title: "x".repeat(61) }).success).toBe(false);
    expect(createFavouriteSchema.safeParse({ ...base, title: "x".repeat(60) }).success).toBe(true);
    expect(createFavouriteSchema.safeParse({ ...base, icon: "BarChart3" }).success).toBe(false);
    expect(createFavouriteSchema.safeParse({ ...base, color: "magenta" }).success).toBe(false);
    expect(createFavouriteSchema.safeParse({ ...base, url: "https://evil.example" }).success).toBe(false);
    expect(createFavouriteSchema.safeParse({ ...base, url: "//evil.example" }).success).toBe(false);
    expect(createFavouriteSchema.safeParse({ ...base, url: `/actions?q=${"a".repeat(2000)}` }).success).toBe(false);
    expect(createFavouriteSchema.safeParse({ kind: "EXTERNAL", url: "javascript:alert(1)", title: "x" }).success).toBe(false);
    expect(createFavouriteSchema.safeParse({ kind: "EXTERNAL", url: "/actions", title: "x" }).success).toBe(false);
    expect(createFavouriteSchema.safeParse({ kind: "BOOKMARK", url: "/actions", title: "x" }).success).toBe(false);
  });

  it("does not take typed details for a website", () => {
    const parsed = createFavouriteSchema.parse({ kind: "EXTERNAL", url: "https://hsa.ie", title: "HSA", snapshot: { a: 1 } });
    expect(parsed).not.toHaveProperty("snapshot");
  });
});

describe("updateFavouriteSchema", () => {
  it("edits title, icon and colour", () => {
    expect(updateFavouriteSchema.parse({ title: "New", icon: null, color: "default" })).toEqual({ title: "New", icon: null, color: null });
  });

  it("changes a website address or replaces the page with typed details", () => {
    expect(updateFavouriteSchema.parse({ url: "hsa.ie" })).toEqual({ url: "https://hsa.ie/" });
    expect(updateFavouriteSchema.parse({ replaceUrl: "/incidents/new", snapshot: { title: "x" } })).toEqual({ replaceUrl: "/incidents/new", snapshot: { title: "x" } });
    expect(updateFavouriteSchema.parse({ replaceUrl: "/incidents/register", snapshot: null })).toEqual({ replaceUrl: "/incidents/register", snapshot: null });
  });

  it("refuses an empty change, both addresses at once, and typed details without the page", () => {
    expect(updateFavouriteSchema.safeParse({}).success).toBe(false);
    expect(updateFavouriteSchema.safeParse({ url: "https://hsa.ie", replaceUrl: "/actions" }).success).toBe(false);
    expect(updateFavouriteSchema.safeParse({ snapshot: { a: 1 } }).success).toBe(false);
    expect(updateFavouriteSchema.safeParse({ title: "" }).success).toBe(false);
  });
});

describe("moveFavouriteSchema", () => {
  it("takes up or down only", () => {
    expect(moveFavouriteSchema.parse({ direction: "up" })).toEqual({ direction: "up" });
    expect(moveFavouriteSchema.safeParse({ direction: "left" }).success).toBe(false);
  });
});
