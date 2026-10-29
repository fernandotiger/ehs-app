import { describe, expect, it } from "vitest";
import { normaliseExternalUrl, websiteLabel } from "./external-url";

const ok = (input: string) => {
  const r = normaliseExternalUrl(input);
  return r.ok ? r.url : null;
};

describe("normaliseExternalUrl", () => {
  it("accepts http(s) addresses and normalises them", () => {
    expect(ok("https://www.hsa.ie/eng/")).toBe("https://www.hsa.ie/eng/");
    expect(ok("  http://example.com  ")).toBe("http://example.com/");
    expect(ok("HTTPS://Example.COM/Path?q=1#top")).toBe("https://example.com/Path?q=1#top");
  });

  it("adds https:// to a bare host name and says so", () => {
    expect(normaliseExternalUrl("www.hsa.ie")).toEqual({ ok: true, url: "https://www.hsa.ie/", addedScheme: true });
    expect(ok("hsa.ie/eng/topics")).toBe("https://hsa.ie/eng/topics");
    expect(ok("intranet.example.com:8443/safety")).toBe("https://intranet.example.com:8443/safety");
    expect(normaliseExternalUrl("https://www.hsa.ie")).toMatchObject({ ok: true, addedScheme: false });
  });

  it("rejects dangerous and non-web schemes", () => {
    for (const bad of ["javascript:alert(1)", "JavaScript:alert(1)", "data:text/html,<b>x</b>", "vbscript:msgbox(1)", "file:///C:/secret.txt", "ftp://example.com", "mailto:a@b.ie", "localhost:3000"]) {
      expect(normaliseExternalUrl(bad).ok, bad).toBe(false);
    }
  });

  it("rejects relative and protocol-relative addresses", () => {
    for (const bad of ["/incidents", "//evil.example", "\\\\evil", "incidents/register", "hsa"]) expect(normaliseExternalUrl(bad).ok, bad).toBe(false);
  });

  it("rejects embedded credentials, spaces and control characters", () => {
    expect(normaliseExternalUrl("https://user:pass@example.com").ok).toBe(false);
    expect(normaliseExternalUrl("https://user@example.com").ok).toBe(false);
    expect(normaliseExternalUrl("https://exa mple.com").ok).toBe(false);
    expect(normaliseExternalUrl(`https://example.com/${String.fromCharCode(0)}x`).ok).toBe(false);
    expect(normaliseExternalUrl(`https://example.com/${String.fromCharCode(0x200b)}x`).ok).toBe(false);
    expect(normaliseExternalUrl(`https://example.com/${String.fromCharCode(10)}x`).ok).toBe(false);
  });

  it("rejects empty and too long addresses", () => {
    expect(normaliseExternalUrl("   ").ok).toBe(false);
    expect(normaliseExternalUrl(`https://example.com/${"a".repeat(2000)}`).ok).toBe(false);
    expect(normaliseExternalUrl(`https://example.com/${"a".repeat(1900)}`).ok).toBe(true);
  });
});

describe("websiteLabel", () => {
  it("shows the host without www", () => {
    expect(websiteLabel("https://www.hsa.ie/eng/")).toBe("hsa.ie");
    expect(websiteLabel("https://osha.europa.eu")).toBe("osha.europa.eu");
    expect(websiteLabel("not a url")).toBe("not a url");
  });
});
