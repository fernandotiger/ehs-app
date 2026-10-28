import "server-only";
import { createHmac } from "node:crypto";
import type { AuditActor } from "@/server/audit/audit-service";
import { env } from "@/server/config/env";

/**
 * Anonymous incident reports store no reporter id. Instead they keep a keyed hash of the reporter
 * (HMAC-SHA256 with the server secret), so the signed-in reporter can still find, follow and – while
 * it is a draft – finish their own report, while the report itself names nobody.
 *
 * The key is per user (not per report) so "my reports" stays one indexed lookup. Consequences (see
 * docs/modules/incidents.md): someone with database access AND the server secret could work out who
 * reported; without the secret they can only tell that two anonymous reports came from the same
 * person. Rotating AUDIT_SIGNING_SECRET cuts reporters off from their old anonymous reports
 * (handlers are unaffected).
 */
export function anonymousReporterKey(userId: string): string {
  const e = env();
  return createHmac("sha256", e.AUDIT_SIGNING_SECRET ?? e.BETTER_AUTH_SECRET)
    .update(`incident.anonymous-reporter:${userId}`)
    .digest("base64url");
}

/** Audit actor for what the anonymous reporter does on their own report (no id, no IP address). */
export const ANONYMOUS_REPORTER: AuditActor = { id: null, name: "Anonymous reporter" };

/**
 * The client id of an anonymous report (wizard / offline outbox id) is stored keyed too: the offline
 * sync log keeps "user X sent operation <id>", which would otherwise point at the report.
 */
export function anonymousClientId(clientId: string): string {
  const e = env();
  return createHmac("sha256", e.AUDIT_SIGNING_SECRET ?? e.BETTER_AUTH_SECRET)
    .update(`incident.anonymous-client:${clientId}`)
    .digest("base64url");
}
