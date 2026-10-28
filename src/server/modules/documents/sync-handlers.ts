import "server-only";
import { offlineSurveyAnswerPayloadSchema } from "@/lib/validation/document-surveys";
import { offlineAcknowledgePayloadSchema } from "@/lib/validation/documents";
import { ValidationError } from "@/server/http/errors";
import type { SyncHandlerMap } from "@/server/modules/sync/sync.types";
import { acknowledgementService } from "./acknowledgement.service";
import { surveyService } from "./survey.service";

/**
 * Offline operations contributed by the Documents module (registered in sync.registry.ts).
 * `document.acknowledge` replays an acknowledgement captured while offline; `document.survey_answer`
 * replays survey answers (idempotent through the participation unique key).
 */
export const documentSyncHandlers: SyncHandlerMap = {
  "document.acknowledge": async (payload, ctx) => {
    const parsed = offlineAcknowledgePayloadSchema.safeParse(payload);
    if (!parsed.success) throw new ValidationError("Invalid acknowledgement payload", parsed.error.issues);
    const { documentId, versionId, clientAcknowledgedAt } = parsed.data;
    const clientAt = new Date(clientAcknowledgedAt);
    return acknowledgementService.acknowledge(
      documentId,
      {
        versionId,
        source: "OFFLINE_SYNC",
        // A device clock in the future is not trusted.
        clientAcknowledgedAt: clientAt.getTime() > Date.now() ? new Date() : clientAt,
      },
      ctx.user,
      ctx.meta,
    );
  },
  "document.survey_answer": async (payload, ctx) => {
    const parsed = offlineSurveyAnswerPayloadSchema.safeParse(payload);
    if (!parsed.success) throw new ValidationError("Invalid induction answer payload", parsed.error.issues);
    const { documentId, surveyId, versionId, anonymous, answers } = parsed.data;
    return surveyService.answer(documentId, { surveyId, versionId, anonymous, answers }, ctx.user, ctx.meta, { source: "OFFLINE_SYNC" });
  },
};
