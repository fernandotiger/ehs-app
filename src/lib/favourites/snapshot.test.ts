import { describe, expect, it } from "vitest";
import { sanitiseSnapshot, SNAPSHOT_MAX_BYTES, snapshotBytes, snapshotTooLarge } from "./snapshot";

describe("sanitiseSnapshot", () => {
  it("keeps plain text, numbers, booleans, null, arrays and nested objects", () => {
    const input = { title: "Spill near dock 3", count: 2, urgent: true, note: null, tags: ["oil", "dock"], where: { siteId: "s1", detail: "Bay 4" } };
    expect(sanitiseSnapshot(input)).toEqual(input);
  });

  it("drops forbidden keys at any depth, case-insensitively", () => {
    const out = sanitiseSnapshot({
      title: "x",
      password: "p",
      uploadId: "u",
      uploadIds: ["u"],
      clientId: "c",
      requestKey: "r",
      Token: "t",
      anonymous: true,
      signature: "s",
      answers: { q1: "yes", q2: { uploadId: "u2", name: "photo.jpg" } },
    });
    expect(out).toEqual({ title: "x", answers: { q1: "yes", q2: { name: "photo.jpg" } } });
  });

  it("drops files, blobs, buffers, functions, symbols, bigints, undefined and non-finite numbers", () => {
    const out = sanitiseSnapshot({
      title: "x",
      file: new Blob(["abc"]),
      bytes: new Uint8Array([1, 2]),
      buffer: new ArrayBuffer(4),
      fn: () => 1,
      sym: Symbol("s"),
      big: BigInt(1),
      missing: undefined,
      nan: Number.NaN,
      list: [new Blob(["x"]), "kept", () => 2],
    });
    expect(out).toEqual({ title: "x", list: ["kept"] });
  });

  it("drops base64 data addresses (signatures, inline images) and non-plain objects; dates become ISO strings", () => {
    const out = sanitiseSnapshot({ sig: "data:image/png;base64,iVBORw0KGgo=", map: new Map([["a", 1]]), set: new Set([1]), when: new Date("2026-03-12T10:00:00Z"), bad: new Date("x") });
    expect(out).toEqual({ when: "2026-03-12T10:00:00.000Z" });
  });

  it("returns null when nothing is left or the input is not an object", () => {
    expect(sanitiseSnapshot({ password: "x", file: new Blob([]) })).toBeNull();
    expect(sanitiseSnapshot(null)).toBeNull();
    expect(sanitiseSnapshot("text")).toBeNull();
    expect(sanitiseSnapshot(["a"])).toBeNull();
    expect(sanitiseSnapshot({})).toBeNull();
  });

  it("cuts off very deep nesting", () => {
    let deep: Record<string, unknown> = { leaf: "x" };
    for (let i = 0; i < 12; i++) deep = { next: deep };
    expect(JSON.stringify(sanitiseSnapshot(deep))).not.toContain("leaf");
  });
});

describe("snapshot size", () => {
  it("measures UTF-8 JSON and flags anything over 16 KB", () => {
    expect(snapshotBytes({ a: "é" })).toBe(JSON.stringify({ a: "é" }).length + 1);
    const justFits = { t: "a".repeat(SNAPSHOT_MAX_BYTES - 8) };
    expect(snapshotBytes(justFits)).toBe(SNAPSHOT_MAX_BYTES);
    expect(snapshotTooLarge(justFits)).toBe(false);
    expect(snapshotTooLarge({ t: "a".repeat(SNAPSHOT_MAX_BYTES) })).toBe(true);
  });
});
