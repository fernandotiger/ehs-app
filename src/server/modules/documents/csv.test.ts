import { AsyncLocalStorage } from "node:async_hooks";
import { describe, expect, it } from "vitest";
import { csvCell, csvFileName, csvRow, csvStreamResponse } from "./csv";

describe("csv helpers", () => {
  it("quotes separators, quotes and newlines", () => {
    expect(csvCell('Say "hi", please')).toBe('"Say ""hi"", please"');
    expect(csvCell("line\nbreak")).toBe('"line\nbreak"');
    expect(csvCell(null)).toBe("");
  });

  it("formats dates, booleans and numbers", () => {
    expect(csvCell(new Date("2026-01-01T00:00:00.000Z"))).toBe("2026-01-01T00:00:00.000Z");
    expect(csvCell(true)).toBe("Yes");
    expect(csvCell(3)).toBe("3");
  });

  it("neutralises spreadsheet formulas", () => {
    expect(csvCell("=HYPERLINK(\"x\")")).toBe("\"'=HYPERLINK(\"\"x\"\")\"");
    expect(csvCell("@cmd")).toBe("'@cmd");
  });

  it("builds rows and file names", () => {
    expect(csvRow(["a", 1, null])).toBe("a,1,\r\n");
    expect(csvFileName("Fire Safety Policy!", "outstanding", new Date("2026-09-14T10:00:00Z"))).toBe("fire-safety-policy-outstanding-2026-09-14.csv");
  });

  it("streams pages inside the async context the response was created in (tenant scope)", async () => {
    const store = new AsyncLocalStorage<string>();
    let pages = 0;
    const seen: (string | undefined)[] = [];
    const response = store.run("tenant-a", () =>
      csvStreamResponse("x.csv", csvRow(["h"]), async () => {
        seen.push(store.getStore());
        return pages++ < 2 ? csvRow([pages]) : null;
      }),
    );
    // Read outside store.run – like Next.js pulling the body after the handler returned.
    const text = new TextDecoder("utf-8", { ignoreBOM: true }).decode(await response.arrayBuffer());
    expect(text).toBe("\uFEFFh\r\n1\r\n2\r\n");
    expect(seen).toEqual(["tenant-a", "tenant-a", "tenant-a"]);
  });
});
