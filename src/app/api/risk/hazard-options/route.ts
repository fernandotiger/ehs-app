import { z } from "zod";
import { idSchema } from "@/lib/validation/common";
import { apiHandler } from "@/server/http/api-handler";
import { riskHazardOptionService } from "@/server/modules/risk/hazard-options.service";

/** GET /api/risk/hazard-options?formVersionId= – active hazard / aspect options of the assessment's Risk form (empty = typed). */
export const GET = apiHandler({ module: "risk", query: z.object({ formVersionId: idSchema }) }, async ({ query }) => riskHazardOptionService.forFormVersion(query.formVersionId));
