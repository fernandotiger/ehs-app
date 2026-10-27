import { describe, expect, it } from "vitest";
import { canonicalJson, signRecord, verifyRecord } from "./signing";

describe("audit record signing", () => {
  it("serialises objects with sorted keys", () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: [3, { f: 1, e: 0 }] } })).toBe('{"a":{"c":[3,{"e":0,"f":1}],"d":2},"b":1}');
  });

  it("produces signatures independent of key order", () => {
    expect(signRecord({ a: 1, b: "x" })).toBe(signRecord({ b: "x", a: 1 }));
  });

  it("detects tampering", () => {
    const record = { userId: "u1", documentId: "d1", versionNumber: 2, acknowledgedAt: "2026-01-01T00:00:00.000Z" };
    const signature = signRecord(record);
    expect(verifyRecord(record, signature)).toBe(true);
    expect(verifyRecord({ ...record, versionNumber: 3 }, signature)).toBe(false);
  });
});
