import { readdirSync } from "node:fs";
import path from "node:path";
import type { LucideIcon } from "lucide-react";
import { describe, expect, it } from "vitest";
import { NAV_SECTIONS, TOP_ITEMS } from "@/components/layout/nav-config";
import { ICON_NAMES } from "./icon-names";
import { isOffered, ROUTES } from "./route-registry";
import { matchRoute } from "./rules";

const APP_DIR = path.resolve(__dirname, "../../app/(app)");

/** Route patterns of every `page.tsx` under src/app/(app) ("(group)" folders don't add a segment). */
function pagePatterns(dir = APP_DIR, segments: string[] = []): string[] {
  const out: string[] = [];
  for (const item of readdirSync(dir, { withFileTypes: true })) {
    if (item.isDirectory()) {
      const segment = /^\(.*\)$/.test(item.name) ? null : item.name;
      out.push(...pagePatterns(path.join(dir, item.name), segment ? [...segments, segment] : segments));
    } else if (item.name === "page.tsx") {
      out.push(`/${segments.join("/")}`);
    }
  }
  return out;
}

const SEARCH = [
  "/documents", "/documents/manage", "/documents/surveys", "/documents/surveys/library", "/incidents/register", "/incidents/actions",
  "/incidents/reports", "/actions", "/risk/assessments", "/risk/tasks", "/risk/strategy", "/risk/reports", "/simplified-law/legislation",
  "/simplified-law/actions",
];
const CREATE = ["/incidents/new", "/actions/new", "/risk/assessments/new", "/documents/manage/new", "/documents/surveys/new"];

describe("route registry – coverage", () => {
  it("has exactly one entry for every page under src/app/(app), and no entry without a page", () => {
    const pages = pagePatterns().sort();
    const patterns = ROUTES.map((r) => r.pattern);
    expect(new Set(patterns).size).toBe(patterns.length);
    expect([...patterns].sort()).toEqual(pages);
  });

  it("offers exactly the 14 search pages and 5 create pages of the brief", () => {
    expect(ROUTES.filter((r) => r.kind === "search").map((r) => r.pattern).sort()).toEqual([...SEARCH].sort());
    expect(ROUTES.filter((r) => r.kind === "create").map((r) => r.pattern).sort()).toEqual([...CREATE].sort());
  });
});

describe("route registry – scope rules", () => {
  it("never offers a record page ([id] in the pattern)", () => {
    expect(ROUTES.filter((r) => isOffered(r) && r.pattern.includes("[")).map((r) => r.pattern)).toEqual([]);
  });

  it("never offers Configuration, Simplified-law configuration or Law pages", () => {
    const blocked = ROUTES.filter((r) => /^\/(configuration|simplified-law\/configuration|law)(\/|$)/.test(r.pattern));
    expect(blocked.length).toBeGreaterThan(20);
    expect(blocked.filter(isOffered).map((r) => r.pattern)).toEqual([]);
  });

  it("never offers Home, My work, overviews, Favourites, print, scan or redirect routes", () => {
    for (const p of ["/dashboard", "/my-work", "/favourites", "/incidents", "/risk", "/simplified-law", "/scan", "/risk/assessments/[id]/print", "/incidents/actions/task/[id]", "/incidents/investigation/[id]"]) {
      expect(ROUTES.find((r) => r.pattern === p)?.kind, p).toBe("other");
    }
  });

  it("gives every create page a seed key, and only create pages", () => {
    for (const r of ROUTES) expect(Boolean(r.seed), r.pattern).toBe(r.kind === "create");
    const seeds = ROUTES.flatMap((r) => (r.seed ? [r.seed] : []));
    expect(new Set(seeds).size).toBe(seeds.length);
  });

  it("uses known icons and consistent tabs / one-time params", () => {
    for (const r of ROUTES) {
      expect(ICON_NAMES, r.pattern).toContain(r.icon);
      if (r.tab) expect(Object.keys(r.tab.labels), r.pattern).toContain(r.tab.default);
      if (r.previousStep) expect(r.oneTimeParams?.length, r.pattern).toBeGreaterThan(0);
      if (r.previousStep?.plainAlternative) expect(isOffered(matchRoute(r.previousStep.plainAlternative)), r.pattern).toBe(true);
    }
  });

  it("uses the URL key names agreed for the search pages' tabs", () => {
    const tabKey = (p: string) => ROUTES.find((r) => r.pattern === p)?.tab?.key;
    expect(tabKey("/incidents/register")).toBe("view");
    expect(tabKey("/incidents/actions")).toBe("view");
    expect(tabKey("/incidents/reports")).toBe("tab");
    expect(tabKey("/documents")).toBe("filter");
    expect(tabKey("/documents/surveys")).toBe("filter");
    expect(tabKey("/actions")).toBe("view");
    expect(tabKey("/risk/strategy")).toBe("tab");
    expect(tabKey("/risk/reports")).toBe("report");
    expect(tabKey("/simplified-law/actions")).toBe("view");
  });
});

describe("matchRoute", () => {
  it("prefers static segments over [id]", () => {
    expect(matchRoute("/incidents/new")?.pattern).toBe("/incidents/new");
    expect(matchRoute("/incidents/register")?.pattern).toBe("/incidents/register");
    expect(matchRoute("/incidents/abc123")?.pattern).toBe("/incidents/[id]");
    expect(matchRoute("/incidents/actions/edit")?.pattern).toBe("/incidents/actions/[id]");
    expect(matchRoute("/incidents/abc/edit")?.pattern).toBe("/incidents/[id]/edit");
    expect(matchRoute("/risk/assessments/new")?.pattern).toBe("/risk/assessments/new");
    expect(matchRoute("/risk/assessments/x1")?.pattern).toBe("/risk/assessments/[id]");
    expect(matchRoute("/documents/manage/new")?.pattern).toBe("/documents/manage/new");
    expect(matchRoute("/documents/surveys/new")?.pattern).toBe("/documents/surveys/new");
    expect(matchRoute("/documents/surveys/library/doc1")?.pattern).toBe("/documents/surveys/library/[id]");
    expect(matchRoute("/simplified-law/configuration/legislation/new")?.pattern).toBe("/simplified-law/configuration/legislation/new");
    expect(matchRoute("/simplified-law/configuration/legislation/l1")?.pattern).toBe("/simplified-law/configuration/legislation/[id]");
  });

  it("ignores query, hash and a trailing slash; unknown paths match nothing", () => {
    expect(matchRoute("/incidents/register?view=investigations#top")?.pattern).toBe("/incidents/register");
    expect(matchRoute("/actions/")?.pattern).toBe("/actions");
    expect(matchRoute("/nope")).toBeNull();
    expect(matchRoute("/")).toBeNull();
    expect(matchRoute("/audits")).toBeNull();
  });
});

describe("navigation consistency", () => {
  const items = [...TOP_ITEMS.map((item) => ({ item, module: undefined })), ...NAV_SECTIONS.flatMap((s) => s.items.map((item) => ({ item, module: s.module })))];

  it("registers every menu link with the same module, compatible permissions and the same icon", () => {
    for (const { item, module } of items) {
      const entry = ROUTES.find((r) => r.pattern === item.href);
      expect(entry, item.href).toBeDefined();
      if (!entry) continue;
      expect(entry.module, item.href).toBe(module);
      // Whoever sees the menu item can open the page: the item's permissions are a subset of the page's.
      if (entry.permissions?.length) {
        expect(item.permissions?.length, item.href).toBeGreaterThan(0);
        for (const p of item.permissions ?? []) expect(entry.permissions, item.href).toContain(p);
      }
      expect(entry.icon, item.href).toBe((item.icon as LucideIcon).displayName);
    }
  });
});
