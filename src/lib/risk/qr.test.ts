import { describe, expect, it } from "vitest";
import { parseQrValue, parseScanInput, riskQrValue, riskScanUrl } from "./qr";

const HERE = "https://app.oleoq.example/scan";

describe("risk QR labels (R-09)", () => {
  it("encodes the stable reference in a /scan link", () => {
    expect(riskQrValue("ra-2026-0001")).toBe("risk:RA-2026-0001");
    expect(riskScanUrl("https://app.oleoq.example", "RA-2026-0001", "northstar")).toBe("https://app.oleoq.example/scan?qr=risk%3ARA-2026-0001&workspace=northstar");
    expect(() => riskScanUrl("ftp://x.example", "RA-1")).toThrow();
  });
  it("accepts a typed reference, a risk: value or a label URL of this site", () => {
    expect(parseScanInput(" ra-lad001 ", HERE)).toEqual({ kind: "risk", key: "RA-LAD001" });
    expect(parseScanInput("risk:RA-2026-0004", HERE)).toEqual({ kind: "risk", key: "RA-2026-0004" });
    expect(parseScanInput("https://app.oleoq.example/scan?qr=risk:RA-2026-0004&workspace=northstar", HERE)).toEqual({ kind: "risk", key: "RA-2026-0004" });
  });
  it("rejects other sites, other paths, duplicate parameters and malformed values", () => {
    expect(() => parseScanInput("https://evil.example/scan?qr=risk:RA-1", HERE)).toThrow(/not a label for this website/);
    expect(() => parseScanInput("https://app.oleoq.example/other?qr=risk:RA-1", HERE)).toThrow();
    expect(() => parseScanInput("https://app.oleoq.example/scan?qr=risk:RA-1&qr=risk:RA-2", HERE)).toThrow(/invalid/);
    expect(() => parseQrValue("inspection:INS-1")).toThrow(/invalid/);
    expect(() => parseScanInput("", HERE)).toThrow();
  });
});
