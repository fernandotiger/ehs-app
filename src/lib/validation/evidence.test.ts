import { describe, expect, it } from "vitest";
import { parseBranding, brandingCss } from "@/lib/branding";
import { normaliseLabel } from "@/lib/lookups";
import { createEvidenceSchema, entityRefSchema, evidenceLinkSchema, isAllowedEvidenceUrl } from "./evidence";

describe("evidence link validation", () => {
  it("accepts absolute http and https addresses", () => {
    expect(isAllowedEvidenceUrl("https://example.com/report.pdf")).toBe(true);
    expect(isAllowedEvidenceUrl("http://intranet.local:8080/a?b=c#d")).toBe(true);
    expect(isAllowedEvidenceUrl("  https://example.com  ")).toBe(true);
  });

  it("rejects other schemes, relative paths and credentials", () => {
    for (const bad of ["javascript:alert(1)", "data:text/html,hi", "mailto:a@b.c", "ftp://example.com", "/relative", "example.com", "https://", "https://user:pw@example.com", ""]) {
      expect(isAllowedEvidenceUrl(bad)).toBe(false);
    }
  });

  it("requires a description and a valid address", () => {
    expect(evidenceLinkSchema.safeParse({ name: "SAP record", url: "https://sap.example.com/x" }).success).toBe(true);
    expect(evidenceLinkSchema.safeParse({ name: "  ", url: "https://sap.example.com/x" }).success).toBe(false);
    expect(evidenceLinkSchema.safeParse({ name: "SAP record", url: "sap.example.com" }).success).toBe(false);
  });

  it("validates the file/link union and the record reference", () => {
    expect(createEvidenceSchema.safeParse({ kind: "FILE", entityType: "Document", entityId: "d1", uploadId: "u1" }).success).toBe(true);
    expect(createEvidenceSchema.safeParse({ kind: "LINK", entityType: "Document", entityId: "d1", name: "x", url: "https://a.b" }).success).toBe(true);
    expect(createEvidenceSchema.safeParse({ kind: "LINK", entityType: "Document", entityId: "d1", url: "https://a.b" }).success).toBe(false);
    expect(entityRefSchema.safeParse({ entityType: "document; drop", entityId: "d1" }).success).toBe(false);
  });
});

describe("lookup labels", () => {
  it("compares labels case- and whitespace-insensitively", () => {
    expect(normaliseLabel("  Health   &  Safety ")).toBe(normaliseLabel("health & safety"));
    expect(normaliseLabel("Quality")).not.toBe(normaliseLabel("Quantity"));
  });
});

describe("tenant branding", () => {
  it("keeps only valid hex colours", () => {
    expect(parseBranding({ primary: "#1F6F5C", secondary: "red", tertiary: "#123" })).toEqual({ primary: "#1f6f5c" });
    expect(parseBranding(null)).toEqual({});
  });

  it("renders CSS variables only for the colours that are set", () => {
    expect(brandingCss({})).toBe("");
    const css = brandingCss({ primary: "#1f6f5c", secondary: "#134438" });
    expect(css).toContain("--brand:#1f6f5c");
    expect(css).toContain("--brand-dark:#134438");
    expect(css).not.toContain("--brand-light");
  });
});
