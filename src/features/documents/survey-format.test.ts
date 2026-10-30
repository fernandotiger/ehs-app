import { describe, expect, it } from "vitest";
import { RESPONSE_FORMS_LIBRARY_HREF, responseFormsLibraryHref } from "./survey-format";

describe("old Survey / Induction Library addresses", () => {
  it("open the Document Library's Response forms tab", () => {
    expect(responseFormsLibraryHref({})).toBe(RESPONSE_FORMS_LIBRARY_HREF);
  });

  it("keep the search, status, Created by me and page; drop a stale tab or type", () => {
    expect(responseFormsLibraryHref({ q: "fire drill", status: "DRAFT", createdBy: "me", page: "2", tab: "documents", type: "survey" })).toBe(
      "/documents/manage?tab=forms&q=fire+drill&status=DRAFT&createdBy=me&page=2",
    );
    expect(responseFormsLibraryHref({ q: " ", status: ["ALL"], other: undefined })).toBe("/documents/manage?tab=forms&status=ALL");
  });
});
