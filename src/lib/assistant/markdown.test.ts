import { describe, expect, it } from "vitest";
import { parseInline, parseMarkdown, safeHref } from "./markdown";

describe("parseInline", () => {
  it("parses bold, italic, code and links", () => {
    expect(parseInline("Open **Incidents → Report incident** and *wait* for `INC-2026-0001`")).toEqual([
      { type: "text", text: "Open " },
      { type: "bold", children: [{ type: "text", text: "Incidents → Report incident" }] },
      { type: "text", text: " and " },
      { type: "italic", children: [{ type: "text", text: "wait" }] },
      { type: "text", text: " for " },
      { type: "code", text: "INC-2026-0001" },
    ]);
    expect(parseInline("See [Report an incident](/incidents/new).")).toEqual([
      { type: "text", text: "See " },
      { type: "link", href: "/incidents/new", internal: true, children: [{ type: "text", text: "Report an incident" }] },
      { type: "text", text: "." },
    ]);
  });

  it("keeps unsafe links as plain text", () => {
    expect(parseInline("[click](javascript:alert(1))")).toEqual([{ type: "text", text: "click)" }]);
    expect(parseInline("[x](//evil.example)")).toEqual([{ type: "text", text: "x" }]);
    expect(parseInline("[HSA](https://www.hsa.ie)")[0]).toMatchObject({ type: "link", internal: false });
  });

  it("leaves lone asterisks alone", () => {
    expect(parseInline("2 * 3 = 6")).toEqual([{ type: "text", text: "2 * 3 = 6" }]);
  });
});

describe("safeHref", () => {
  it("allows app pages and https websites only", () => {
    expect(safeHref("/documents/manage?tab=forms")).toEqual({ href: "/documents/manage?tab=forms", internal: true });
    expect(safeHref("https://openrouter.ai/models")).toEqual({ href: "https://openrouter.ai/models", internal: false });
    for (const bad of ["javascript:alert(1)", "http://example.com", "//example.com", "/\\example.com", "mailto:a@b.c", "data:text/html,x"]) {
      expect(safeHref(bad)).toBeNull();
    }
  });
});

describe("parseMarkdown", () => {
  it("splits paragraphs, headings and lists", () => {
    const blocks = parseMarkdown("## Report an incident\nFollow these steps:\n\n1. Open **Incidents**\n2. Click **Report incident**\n\n- Tip one\n* Tip two\n\nDone.");
    expect(blocks.map((b) => b.type)).toEqual(["heading", "paragraph", "list", "list", "paragraph"]);
    expect(blocks[2]).toMatchObject({ type: "list", ordered: true, start: 1 });
    expect(blocks[3]).toMatchObject({ type: "list", ordered: false });
    if (blocks[2].type === "list") expect(blocks[2].items).toHaveLength(2);
  });

  it("keeps line breaks inside a paragraph and joins indented list continuations", () => {
    const blocks = parseMarkdown("Line one\nLine two\n\n3. Step three\n   more about step three\n4. Step four");
    expect(blocks[0]).toEqual({ type: "paragraph", lines: [[{ type: "text", text: "Line one" }], [{ type: "text", text: "Line two" }]] });
    expect(blocks[1]).toMatchObject({ type: "list", ordered: true, start: 3 });
    if (blocks[1].type === "list") expect(blocks[1].items[0]).toEqual([{ type: "text", text: "Step three more about step three" }]);
  });

  it("ignores code fences and rules and survives half-written text while streaming", () => {
    expect(parseMarkdown("```\n**Bold\n---")).toEqual([{ type: "paragraph", lines: [[{ type: "text", text: "**Bold" }]] }]);
    expect(parseMarkdown("")).toEqual([]);
  });

  it("never produces HTML – tags stay text", () => {
    expect(parseMarkdown("<img src=x onerror=alert(1)>")).toEqual([{ type: "paragraph", lines: [[{ type: "text", text: "<img src=x onerror=alert(1)>" }]] }]);
  });
});
