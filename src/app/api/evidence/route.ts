import { createEvidenceSchema, entityRefSchema } from "@/lib/validation/evidence";
import { apiHandler } from "@/server/http/api-handler";
import { evidenceService } from "@/server/modules/evidence/evidence.service";

/** GET /api/evidence?entityType=Document&entityId=… – files and links on a record. */
export const GET = apiHandler({ query: entityRefSchema }, async ({ query, user }) => evidenceService.list(user, query.entityType, query.entityId));

/** POST /api/evidence – { kind: "FILE", uploadId } or { kind: "LINK", name, url } for a record. */
export const POST = apiHandler({ body: createEvidenceSchema }, async ({ body, user, meta }) => evidenceService.add(user, body, meta));
