import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/server/config/env";

/** Deterministic JSON serialisation (sorted keys) so signatures are reproducible. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value ?? null);
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
}

function secret(): string {
  const e = env();
  return e.AUDIT_SIGNING_SECRET ?? e.BETTER_AUTH_SECRET;
}

/** HMAC-SHA256 signature for tamper-evident audit and acknowledgement records. */
export function signRecord(record: Record<string, unknown>): string {
  return createHmac("sha256", secret()).update(canonicalJson(record)).digest("hex");
}

export function verifyRecord(record: Record<string, unknown>, signature: string): boolean {
  const expected = Buffer.from(signRecord(record), "hex");
  const actual = Buffer.from(signature, "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
