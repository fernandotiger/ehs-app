import { describe, expect, it } from "vitest";
import { PERMISSIONS } from "@/lib/permissions";
import { allNavItems, changesPage, findActiveHref, TOP_ITEMS, visibleSections } from "./nav-config";

describe("top items", () => {
  it("shows Favourites right after My work to everyone (no module, no permission)", () => {
    expect(TOP_ITEMS.map((i) => i.title)).toEqual(["Home", "My work", "Favourites"]);
    const favourites = TOP_ITEMS.find((i) => i.href === "/favourites");
    expect(favourites?.permissions).toBeUndefined();
    const items = allNavItems({ permissions: [], enabledModules: [] });
    expect(items.map((i) => i.href)).toEqual(["/dashboard", "/my-work", "/favourites"]);
    expect(findActiveHref("/favourites", items)).toBe("/favourites");
  });
});

const documentsItems = (permissions: (typeof PERMISSIONS)[keyof typeof PERMISSIONS][]) =>
  visibleSections({ permissions, enabledModules: ["documents"] }).find((s) => s.key === "documents")?.items ?? [];

describe("Documents menu", () => {
  it("shows only My Documents, My Response Forms and (for managers and reporters) Document Library", () => {
    expect(documentsItems([PERMISSIONS.DOCUMENTS_MANAGE]).map((i) => i.title)).toEqual(["My Documents", "My Response Forms", "Document Library"]);
    expect(documentsItems([PERMISSIONS.DOCUMENTS_ACK_REPORTS]).map((i) => i.title)).toEqual(["My Documents", "My Response Forms", "Document Library"]);
    expect(documentsItems([]).map((i) => i.title)).toEqual(["My Documents", "My Response Forms"]);
  });

  it("highlights Document Library on a response form's page and on Create response form", () => {
    const items = documentsItems([PERMISSIONS.DOCUMENTS_MANAGE]);
    expect(findActiveHref("/documents", items)).toBe("/documents");
    expect(findActiveHref("/documents/abc", items)).toBe("/documents");
    expect(findActiveHref("/documents/surveys", items)).toBe("/documents/surveys");
    expect(findActiveHref("/documents/surveys/library", items)).toBe("/documents/manage");
    expect(findActiveHref("/documents/surveys/library/abc", items)).toBe("/documents/manage");
    expect(findActiveHref("/documents/surveys/new", items)).toBe("/documents/manage");
    expect(findActiveHref("/documents/manage/abc", items)).toBe("/documents/manage");
    // Without the library item a create link can't highlight anything but My Response Forms.
    expect(findActiveHref("/documents/surveys/new", documentsItems([]))).toBe("/documents/surveys");
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
