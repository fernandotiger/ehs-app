import { describe, expect, it } from "vitest";
import { contrastRatio, readableTextColour } from "@/lib/branding";
import { inspectLogo } from "./logo-image";

/** 1×1 transparent PNG. */
const PNG = Uint8Array.from(
  atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="),
  (c) => c.charCodeAt(0),
);

/** Minimal baseline JPEG header: SOI, APP0, SOF0 (16×8), EOI. */
const JPEG = new Uint8Array([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
  0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x08, 0x00, 0x10, 0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01, 0xff, 0xd9,
]);

const text = (s: string) => new TextEncoder().encode(s);

describe("logo checks (C-09)", () => {
  it("accepts a readable PNG and reports its size", () => {
    expect(inspectLogo(PNG)).toEqual({ ok: true, mimeType: "image/png", extension: "png", width: 1, height: 1 });
  });

  it("accepts a readable JPEG", () => {
    expect(inspectLogo(JPEG)).toMatchObject({ ok: true, mimeType: "image/jpeg", width: 16, height: 8 });
  });

  it("accepts a plain SVG", () => {
    const svg = text('<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="120" height="40"><rect width="10" height="10" fill="#18344A"/></svg>');
    expect(inspectLogo(svg)).toMatchObject({ ok: true, mimeType: "image/svg+xml", width: 120, height: 40 });
  });

  it("rejects corrupt images", () => {
    expect(inspectLogo(PNG.slice(0, 40))).toMatchObject({ ok: false, error: expect.stringMatching(/damaged/) });
    expect(inspectLogo(JPEG.slice(0, 30))).toMatchObject({ ok: false });
    expect(inspectLogo(text("<svg><rect"))).toMatchObject({ ok: false });
  });

  it("rejects unsupported, empty and oversized files", () => {
    expect(inspectLogo(text("GIF89a......"))).toEqual({ ok: false, error: "Use a PNG, JPG or SVG image." });
    expect(inspectLogo(new Uint8Array())).toEqual({ ok: false, error: "The file is empty." });
    const big = new Uint8Array(3 * 1024 * 1024);
    big.set(PNG);
    expect(inspectLogo(big)).toEqual({ ok: false, error: "The logo is larger than 2 MB." });
  });

  it("rejects SVGs with scripts, handlers or external references", () => {
    expect(inspectLogo(text('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'))).toMatchObject({ ok: false });
    expect(inspectLogo(text('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>'))).toMatchObject({ ok: false });
    expect(inspectLogo(text('<svg xmlns="http://www.w3.org/2000/svg"><image href="https://evil.example/x.png"/></svg>'))).toMatchObject({ ok: false });
  });
});

describe("readable brand text", () => {
  it("picks white on dark colours and dark text on light colours", () => {
    expect(readableTextColour("#18344a")).toBe("#ffffff");
    expect(readableTextColour("#a9d8d1")).toBe("#111827");
    expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 0);
  });
});
