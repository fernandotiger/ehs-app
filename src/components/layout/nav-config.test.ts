import { describe, expect, it } from "vitest";
import { PERMISSIONS } from "@/lib/permissions";
import { changesPage, findActiveHref, visibleSections } from "./nav-config";

const documentsItems = (permissions: (typeof PERMISSIONS)[keyof typeof PERMISSIONS][]) =>
  visibleSections({ permissions, enabledModules: ["documents"] }).find((s) => s.key === "documents")?.items ?? [];

describe("Documents menu", () => {
  it("shows My Surveys to everyone, the Survey Library to managers and reporters, Create survey to managers", () => {
    expect(documentsItems([PERMISSIONS.DOCUMENTS_MANAGE]).map((i) => i.title)).toEqual(["My Documents", "Document Library", "My Surveys", "Survey Library", "Create survey"]);
    expect(documentsItems([PERMISSIONS.DOCUMENTS_ACK_REPORTS]).map((i) => i.title)).toEqual(["My Documents", "Document Library", "My Surveys", "Survey Library"]);
    expect(documentsItems([]).map((i) => i.title)).toEqual(["My Documents", "My Surveys"]);
  });

  it("highlights the most specific survey entry", () => {
    const items = documentsItems([PERMISSIONS.DOCUMENTS_MANAGE]);
    expect(findActiveHref("/documents/surveys", items)).toBe("/documents/surveys");
    expect(findActiveHref("/documents/surveys/library", items)).toBe("/documents/surveys/library");
    expect(findActiveHref("/documents/surveys/new", items)).toBe("/documents/surveys/new");
    expect(findActiveHref("/documents/manage/abc", items)).toBe("/documents/manage");
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
