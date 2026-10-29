/**
 * Website links in Favourites. Only http(s) addresses are kept: no javascript:/data:/file: links,
 * no relative or "//host" addresses, no user name or password in the address, no spaces or control
 * characters, at most 2 000 characters. "www.hsa.ie" gets "https://" added (the dialog shows it).
 */

export const URL_MAX_LENGTH = 2000;

export type ExternalUrlResult = { ok: true; url: string; addedScheme: boolean } | { ok: false; error: string };

/** Control characters, spaces and invisible spaces (no-break, zero-width, line separators, BOM). */
function hasControlOrSpace(value: string): boolean {
  for (const ch of value) {
    const c = ch.codePointAt(0) ?? 0;
    if (c <= 0x20 || (c >= 0x7f && c <= 0xa0) || c === 0x1680 || (c >= 0x2000 && c <= 0x200b)) return true;
    if (c === 0x2028 || c === 0x2029 || c === 0x202f || c === 0x205f || c === 0x3000 || c === 0xfeff) return true;
  }
  return false;
}
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i;
/** Looks like a host name ("www.hsa.ie", "hsa.ie/path") – something with a dot before any path. */
const BARE_HOST = /^[a-z0-9-]+(\.[a-z0-9-]+)+(:\d+)?([/?#]|$)/i;

export function normaliseExternalUrl(input: string): ExternalUrlResult {
  const value = input.trim();
  if (!value) return { ok: false, error: "Enter the website address" };
  if (value.length > URL_MAX_LENGTH) return { ok: false, error: "The address is too long (2 000 characters at most)" };
  if (hasControlOrSpace(value)) return { ok: false, error: "The address can't contain spaces" };
  if (value.startsWith("/") || value.startsWith("\\")) return { ok: false, error: "Enter a full website address, like https://www.hsa.ie" };

  let candidate = value;
  let addedScheme = false;
  if (!HAS_SCHEME.test(value) || /^[a-z0-9-]+(\.[a-z0-9-]+)+:\d+/i.test(value)) {
    if (!BARE_HOST.test(value)) return { ok: false, error: "Enter a full website address, like https://www.hsa.ie" };
    candidate = `https://${value}`;
    addedScheme = true;
  }

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return { ok: false, error: "This doesn't look like a website address" };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return { ok: false, error: "Only website addresses starting with https:// or http:// can be added" };
  if (url.username || url.password) return { ok: false, error: "Remove the user name or password from the address" };
  if (!url.hostname) return { ok: false, error: "This doesn't look like a website address" };
  if (url.href.length > URL_MAX_LENGTH) return { ok: false, error: "The address is too long (2 000 characters at most)" };
  return { ok: true, url: url.href, addedScheme };
}

/** "hsa.ie" for https://www.hsa.ie/eng/ – used for the default title and the tile subtitle. */
export function websiteLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, "");
  } catch {
    return url;
  }
}
