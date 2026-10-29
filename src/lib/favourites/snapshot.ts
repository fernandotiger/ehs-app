/**
 * Typed values of a create page kept with a favourite ("seed"). Each form picks the fields it keeps;
 * `sanitiseSnapshot` is the backstop used by the browser before saving and by the server on save.
 *
 * Dropped: files and blobs, functions, symbols, bigints, non-plain objects (Map, Set, class
 * instances), base64 `data:` strings (signatures, inline images), and the forbidden keys below
 * (at any depth). Dates become ISO strings. Too-deep nesting is cut off. The result is capped at
 * 16 KB of JSON – callers refuse (server) or save the page without it (browser).
 */

export const SNAPSHOT_MAX_BYTES = 16 * 1024;

/** Never kept, whatever the form picks (compared case-insensitively). */
export const FORBIDDEN_SNAPSHOT_KEYS = ["password", "uploadId", "uploadIds", "clientId", "requestKey", "token", "anonymous", "signature"] as const;

const FORBIDDEN = new Set(FORBIDDEN_SNAPSHOT_KEYS.map((k) => k.toLowerCase()));
const MAX_DEPTH = 8;
const DATA_URL = /^data:[^,]*;base64,/i;

export type SnapshotValue = string | number | boolean | null | SnapshotValue[] | { [key: string]: SnapshotValue };
export type Snapshot = { [key: string]: SnapshotValue };

const DROP = Symbol("drop");

function isPlainObject(value: object): value is Record<string, unknown> {
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function isFileLike(value: object): boolean {
  if (typeof Blob !== "undefined" && value instanceof Blob) return true;
  if (typeof ArrayBuffer !== "undefined" && (value instanceof ArrayBuffer || ArrayBuffer.isView(value))) return true;
  return false;
}

function clean(value: unknown, depth: number): SnapshotValue | typeof DROP {
  if (value === null) return null;
  switch (typeof value) {
    case "string":
      return DATA_URL.test(value) ? DROP : value;
    case "number":
      return Number.isFinite(value) ? value : DROP;
    case "boolean":
      return value;
    case "object":
      break;
    default:
      // undefined, function, symbol, bigint
      return DROP;
  }
  const obj = value as object;
  if (obj instanceof Date) return Number.isNaN(obj.getTime()) ? DROP : obj.toISOString();
  if (isFileLike(obj) || depth >= MAX_DEPTH) return DROP;
  if (Array.isArray(obj)) {
    const out: SnapshotValue[] = [];
    for (const item of obj) {
      const cleaned = clean(item, depth + 1);
      if (cleaned !== DROP) out.push(cleaned);
    }
    return out;
  }
  if (!isPlainObject(obj)) return DROP;
  const out: Snapshot = {};
  for (const [key, item] of Object.entries(obj)) {
    if (FORBIDDEN.has(key.toLowerCase())) continue;
    const cleaned = clean(item, depth + 1);
    if (cleaned !== DROP) out[key] = cleaned;
  }
  return out;
}

/**
 * A clean copy of the typed values, or null when nothing worth keeping is left (not an object,
 * or every field dropped). Does not check the size – see `snapshotTooLarge`.
 */
export function sanitiseSnapshot(input: unknown): Snapshot | null {
  if (input === null || typeof input !== "object" || Array.isArray(input)) return null;
  const cleaned = clean(input, 0);
  if (cleaned === DROP || cleaned === null || typeof cleaned !== "object" || Array.isArray(cleaned)) return null;
  return Object.keys(cleaned).length ? cleaned : null;
}

/** Size of the snapshot as UTF-8 JSON. */
export function snapshotBytes(snapshot: Snapshot): number {
  return new TextEncoder().encode(JSON.stringify(snapshot)).length;
}

export function snapshotTooLarge(snapshot: Snapshot): boolean {
  return snapshotBytes(snapshot) > SNAPSHOT_MAX_BYTES;
}
