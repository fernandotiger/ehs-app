/**
 * QR labels for risk assessments (ported from the prototype's field-access model).
 *
 * A label encodes `<origin>/scan?qr=risk:<REFERENCE>&workspace=<slug>`. The reference never
 * changes through reviews/revisions, so one printed label keeps opening the same assessment.
 * Scanning never authenticates: /scan sits behind sign-in and resolves the reference inside the
 * signed-in user's company with the normal access rules. Pure – shared by client, server and tests.
 */

export interface QrTarget {
  kind: "risk";
  /** Assessment reference (or its stable label id). */
  key: string;
}

const REFERENCE = /^[A-Z0-9]+(?:-[A-Z0-9]+)+$/;

/** The value stored in the `qr` parameter. */
export function riskQrValue(reference: string): string {
  return `risk:${reference.trim().toUpperCase()}`;
}

/** Full label URL for an assessment. Throws for non-http(s) or credential-bearing origins. */
export function riskScanUrl(origin: string, reference: string, workspace?: string): string {
  const url = new URL("/scan", origin);
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) throw new Error("Enter your workspace's HTTP or HTTPS website address.");
  url.searchParams.set("qr", riskQrValue(reference));
  if (workspace) url.searchParams.set("workspace", workspace);
  return url.href;
}

/** Parses a `qr` parameter value (`risk:RA-2026-0001`). */
export function parseQrValue(value: string): QrTarget {
  const match = /^risk:([A-Za-z0-9-]{3,64})$/.exec(value.trim());
  if (!match || !REFERENCE.test(match[1]!.toUpperCase())) throw new Error("The label's record reference is invalid.");
  return { kind: "risk", key: match[1]!.toUpperCase() };
}

/**
 * What a person scanned or typed: a reference ("RA-2026-0001"), a `risk:` value or a label URL of
 * THIS site (same origin, /scan, exactly one qr parameter). Anything else is rejected with a
 * plain message.
 */
export function parseScanInput(input: string, currentUrl: string): QrTarget {
  const value = input.trim();
  if (!value) throw new Error("Scan a label or type an assessment reference.");
  if (REFERENCE.test(value.toUpperCase()) && !value.includes(":")) return { kind: "risk", key: value.toUpperCase() };
  if (/^risk:/i.test(value)) return parseQrValue(value);
  let url: URL;
  try {
    url = new URL(value, currentUrl);
  } catch {
    throw new Error("Scan an OleoQ label or type its RA reference.");
  }
  const current = new URL(currentUrl);
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || url.origin !== current.origin || url.pathname !== "/scan") {
    throw new Error("This is not a label for this website. Open it on your company's OleoQ address.");
  }
  const values = url.searchParams.getAll("qr");
  if (values.length !== 1) throw new Error("The label's record reference is invalid.");
  return parseQrValue(values[0]!);
}
