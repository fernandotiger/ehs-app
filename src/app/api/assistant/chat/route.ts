import { assistantChatSchema } from "@/lib/validation/assistant";
import { apiHandler } from "@/server/http/api-handler";
import { assistantService } from "@/server/modules/assistant/assistant.service";

/** Answers stream for up to ~2 minutes (free models can be slow). */
export const maxDuration = 120;

/** POST /api/assistant/chat – { messages, page } → NDJSON stream (src/lib/assistant/stream-protocol.ts). Nothing is stored. */
export const POST = apiHandler({ body: assistantChatSchema }, async ({ body, user, req }) => assistantService.chat(user, body, req.signal));
