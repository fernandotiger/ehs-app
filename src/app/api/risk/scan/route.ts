import { parseQrValue } from "@/lib/risk/qr";
import { scanQuerySchema } from "@/lib/validation/risk";
import { apiHandler } from "@/server/http/api-handler";
import { ValidationError } from "@/server/http/errors";
import { assessmentQueryService } from "@/server/modules/risk/assessment-query.service";

/** GET /api/risk/scan?qr=risk:RA-2026-0001 (or a typed reference) – resolves a label inside the caller's company and access (404 otherwise). */
export const GET = apiHandler({ module: "risk", query: scanQuerySchema }, async ({ query, user }) => {
  let key: string;
  try {
    key = query.qr.includes(":") ? parseQrValue(query.qr).key : query.qr.trim().toUpperCase();
  } catch (error) {
    throw new ValidationError(error instanceof Error ? error.message : "The label's record reference is invalid.");
  }
  if (!key) throw new ValidationError("Scan a label or type an assessment reference.");
  return assessmentQueryService.resolveScan(user, key);
});
