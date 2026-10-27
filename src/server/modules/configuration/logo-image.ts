/**
 * Logo file checks (pure, unit-tested): accepts readable PNG, JPEG and SVG images up to 2 MB.
 * The type is decided from the bytes, never from the file name or the browser's MIME type.
 * SVGs are rejected when they contain scripts, event handlers, external references or
 * entity declarations, and are additionally served with a locked-down CSP.
 */

export type LogoMimeType = "image/png" | "image/jpeg" | "image/svg+xml";

export type LogoCheck =
  | { ok: true; mimeType: LogoMimeType; extension: "png" | "jpg" | "svg"; width: number | null; height: number | null }
  | { ok: false; error: string };

const MAX_DIMENSION = 20_000;
const UNSUPPORTED = "Use a PNG, JPG or SVG image.";
const DAMAGED = "The image could not be read – it looks damaged or incomplete.";

function readU32(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset]! << 24) | (bytes[offset + 1]! << 16) | (bytes[offset + 2]! << 8) | bytes[offset + 3]!) >>> 0;
}

function readU16(bytes: Uint8Array, offset: number): number {
  return (bytes[offset]! << 8) | bytes[offset + 1]!;
}

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  return signature.every((b, i) => bytes[i] === b);
}

function dimensionsOk(width: number, height: number) {
  return width > 0 && height > 0 && width <= MAX_DIMENSION && height <= MAX_DIMENSION;
}

function checkPng(bytes: Uint8Array): LogoCheck {
  if (bytes.length < 33) return { ok: false, error: DAMAGED };
  const ihdr = String.fromCharCode(...bytes.slice(12, 16));
  if (ihdr !== "IHDR") return { ok: false, error: DAMAGED };
  const width = readU32(bytes, 16);
  const height = readU32(bytes, 20);
  if (!dimensionsOk(width, height)) return { ok: false, error: DAMAGED };
  const tail = String.fromCharCode(...bytes.slice(Math.max(0, bytes.length - 12)));
  if (!tail.includes("IEND")) return { ok: false, error: DAMAGED };
  return { ok: true, mimeType: "image/png", extension: "png", width, height };
}

const SOF_MARKERS = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);

function checkJpeg(bytes: Uint8Array): LogoCheck {
  // End-of-image marker near the end (some encoders append a few padding bytes).
  let hasEnd = false;
  for (let i = bytes.length - 2; i >= Math.max(2, bytes.length - 64); i--) {
    if (bytes[i] === 0xff && bytes[i + 1] === 0xd9) {
      hasEnd = true;
      break;
    }
  }
  if (!hasEnd) return { ok: false, error: DAMAGED };
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) return { ok: false, error: DAMAGED };
    const marker = bytes[offset + 1]!;
    if (marker === 0xff) {
      offset++;
      continue;
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    const length = readU16(bytes, offset + 2);
    if (length < 2) return { ok: false, error: DAMAGED };
    if (SOF_MARKERS.has(marker)) {
      const height = readU16(bytes, offset + 5);
      const width = readU16(bytes, offset + 7);
      if (!dimensionsOk(width, height)) return { ok: false, error: DAMAGED };
      return { ok: true, mimeType: "image/jpeg", extension: "jpg", width, height };
    }
    if (marker === 0xda) break; // start of scan before any frame header
    offset += 2 + length;
  }
  return { ok: false, error: DAMAGED };
}

const SVG_FORBIDDEN: { pattern: RegExp; reason: string }[] = [
  { pattern: /<\s*script/i, reason: "scripts" },
  { pattern: /<\s*foreignObject/i, reason: "embedded HTML" },
  { pattern: /<\s*(iframe|embed|object)\b/i, reason: "embedded content" },
  { pattern: /<!ENTITY/i, reason: "entity declarations" },
  { pattern: /\son[a-z]+\s*=/i, reason: "event handlers" },
  { pattern: /javascript\s*:/i, reason: "script links" },
  { pattern: /(?:href|src)\s*=\s*["']\s*(?!#|data:image\/)/i, reason: "external references" },
  { pattern: /url\(\s*["']?\s*(?!#|data:image\/)[a-z]+:/i, reason: "external references" },
  { pattern: /@import/i, reason: "external styles" },
];

function checkSvg(bytes: Uint8Array): LogoCheck {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^﻿/, "");
  } catch {
    return { ok: false, error: DAMAGED };
  }
  const body = text.replace(/<\?xml[\s\S]*?\?>/g, "").replace(/<!--[\s\S]*?-->/g, "").replace(/<!DOCTYPE[^>[]*>/gi, "").trim();
  if (!/^<svg[\s>]/i.test(body)) return { ok: false, error: UNSUPPORTED };
  if (!/<\/svg\s*>\s*$/i.test(body) && !/^<svg[^>]*\/>\s*$/i.test(body)) return { ok: false, error: DAMAGED };
  for (const rule of SVG_FORBIDDEN) {
    if (rule.pattern.test(text)) return { ok: false, error: `This SVG contains ${rule.reason}, which are not allowed in a logo. Export it as a plain SVG or PNG.` };
  }
  const root = /^<svg[^>]*>/i.exec(body)?.[0] ?? "";
  const num = (attr: string) => {
    const match = new RegExp(`\\s${attr}\\s*=\\s*["']\\s*([0-9.]+)`, "i").exec(root);
    return match ? Math.round(Number(match[1])) || null : null;
  };
  return { ok: true, mimeType: "image/svg+xml", extension: "svg", width: num("width"), height: num("height") };
}

export function inspectLogo(bytes: Uint8Array, maxBytes = 2 * 1024 * 1024): LogoCheck {
  if (bytes.length === 0) return { ok: false, error: "The file is empty." };
  if (bytes.length > maxBytes) return { ok: false, error: `The logo is larger than ${Math.round(maxBytes / 1024 / 1024)} MB.` };
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return checkPng(bytes);
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return checkJpeg(bytes);
  const head = new TextDecoder("utf-8", { fatal: false }).decode(bytes.slice(0, 1024)).trimStart().toLowerCase();
  if (head.startsWith("<?xml") || head.startsWith("<svg") || head.startsWith("<!--") || head.startsWith("﻿<")) return checkSvg(bytes);
  return { ok: false, error: UNSUPPORTED };
}
