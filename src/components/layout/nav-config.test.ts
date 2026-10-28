import { describe, expect, it } from "vitest";
import { PERMISSIONS } from "@/lib/permissions";
import { changesPage, findActiveHref, visibleSections } from "./nav-config";

const documentsItems = (permissions: (typeof PERMISSIONS)[keyof typeof PERMISSIONS][]) =>
  visibleSections({ permissions, enabledModules: ["documents"] }).find((s) => s.key === "documents")?.items ?? [];

describe("Documents menu", () => {
  it("shows My Inductions to everyone, the Induction Library to managers and reporters, Create induction to managers", () => {
    expect(documentsItems([PERMISSIONS.DOCUMENTS_MANAGE]).map((i) => i.title)).toEqual(["My Documents", "Document Library", "My Inductions", "Induction Library", "Create induction"]);
    expect(documentsItems([PERMISSIONS.DOCUMENTS_ACK_REPORTS]).map((i) => i.title)).toEqual(["My Documents", "Document Library", "My Inductions", "Induction Library"]);
    expect(documentsItems([]).map((i) => i.title)).toEqual(["My Documents", "My Inductions"]);
  });

  it("highlights the most specific induction (survey route) entry", () => {
    const items = documentsItems([PERMISSIONS.DOCUMENTS_MANAGE]);
    expect(findActiveHref("/documents/surveys", items)).toBe("/documents/surveys");
    expect(findActiveHref("/documents/surveys/library", items)).toBe("/documents/surveys/library");
    expect(findActiveHref("/documents/surveys/new", items)).toBe("/documents/surveys/new");
    expect(findActiveHref("/documents/manage/abc", items)).toBe("/documents/manage");
  });
});

describe("Actions menu", () => {
  const all = ["documents", "incidents", "risk", "actions"] as const;

  it("sits just before Configuration and offers Create Action only with action.create", () => {
    const keys = visibleSections({ permissions: [PERMISSIONS.ACTION_CREATE, PERMISSIONS.ADMIN_SETTINGS], enabledModules: [...all] }).map((s) => s.key);
    expect(keys.slice(-2)).toEqual(["actions", "configuration"]);
    const items = (permissions: (typeof PERMISSIONS)[keyof typeof PERMISSIONS][]) => visibleSections({ permissions, enabledModules: [...all] }).find((s) => s.key === "actions")?.items.map((i) => i.title);
    expect(items([PERMISSIONS.ACTION_CREATE])).toEqual(["My Actions", "Create Action"]);
    expect(items([])).toEqual(["My Actions"]);
  });

  it("disappears when the tenant has not enabled the module; an action page highlights My Actions", () => {
    expect(visibleSections({ permissions: [PERMISSIONS.ACTION_CREATE], enabledModules: ["documents"] }).some((s) => s.key === "actions")).toBe(false);
    const items = visibleSections({ permissions: [PERMISSIONS.ACTION_CREATE], enabledModules: ["actions"] }).find((s) => s.key === "actions")!.items;
    expect(findActiveHref("/actions/abc123", items)).toBe("/actions");
    expect(findActiveHref("/actions/new", items)).toBe("/actions/new");
  });
});

describe("folding the sidebar after picking a page", () => {
  const click = { button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, defaultPrevented: false };

  it("folds when a plain click opens another page", () => {
    expect(changesPage(click, "/risk", "/documents")).toBe(true);
    expect(changesPage(click, "/documents", "/documents/abc")).toBe(true);
  });

  it("stays open when the page does not change on the right", () => {
    expect(changesPage(click, "/documents", "/documents")).toBe(false);
    expect(changesPage({ ...click, ctrlKey: true }, "/risk", "/documents")).toBe(false);
    expect(changesPage({ ...click, metaKey: true }, "/risk", "/documents")).toBe(false);
    expect(changesPage({ ...click, shiftKey: true }, "/risk", "/documents")).toBe(false);
    expect(changesPage({ ...click, button: 1 }, "/risk", "/documents")).toBe(false);
    expect(changesPage({ ...click, defaultPrevented: true }, "/risk", "/documents")).toBe(false);
  });
});
