/**
 * AI assistant – the streamed reply format between /api/assistant/chat (and the Configuration
 * test box) and the browser: newline-delimited JSON (application/x-ndjson), one event per line.
 *
 *   {"type":"delta","text":"Open **Incidents"}
 *   {"type":"delta","text":" → Report incident**…"}
 *   {"type":"done","model":"google/gemma-4-31b-it:free"}
 *
 * Problems before the stream starts (not signed in, rate limit, not set up) are normal JSON error
 * responses; problems from the AI service arrive as an "error" event with a plain message.
 */

export type AssistantErrorCode =
  /** OpenRouter or the model provider is rate-limiting (free tier: 20 a minute, 50–1000 a day). */
  | "busy"
  /** Paid model without credit (402) or an account budget reached. */
  | "no_credit"
  /** The key was refused (401). */
  | "not_connected"
  /** The OpenRouter account's privacy settings exclude every endpoint of the model (404 "data policy"). */
  | "policy"
  /** Moderation / guardrail refused the question (403). */
  | "declined"
  /** Model unknown, down or no provider available (404 / 502 / 503). */
  | "unavailable"
  | "timeout"
  /** The conversation does not fit the model (context length). */
  | "too_long"
  /** The model finished without any text. */
  | "empty"
  /** The AI service could not be reached. */
  | "network"
  | "error";

export type AssistantStreamEvent =
  | { type: "delta"; text: string }
  | { type: "done"; model: string | null }
  /** `partial` = some text was already streamed before the problem (the answer was cut off). */
  | { type: "error"; code: AssistantErrorCode; message: string; partial: boolean };

export const ASSISTANT_STREAM_CONTENT_TYPE = "application/x-ndjson; charset=utf-8";

export function encodeStreamEvent(event: AssistantStreamEvent): string {
  return `${JSON.stringify(event)}\n`;
}

function isStreamEvent(value: unknown): value is AssistantStreamEvent {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  if (v.type === "delta") return typeof v.text === "string";
  if (v.type === "done") return v.model === null || typeof v.model === "string";
  if (v.type === "error") return typeof v.message === "string" && typeof v.code === "string";
  return false;
}

/**
 * Splits streamed text into events. Feed it every decoded chunk; a line cut between two chunks is
 * kept until its end arrives. Unknown or broken lines are skipped.
 */
export function createStreamEventDecoder(): { push(chunk: string): AssistantStreamEvent[]; flush(): AssistantStreamEvent[] } {
  let buffer = "";
  const parse = (line: string): AssistantStreamEvent[] => {
    const trimmed = line.trim();
    if (!trimmed) return [];
    try {
      const value: unknown = JSON.parse(trimmed);
      return isStreamEvent(value) ? [value] : [];
    } catch {
      return [];
    }
  };
  return {
    push(chunk) {
      buffer += chunk;
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      return lines.flatMap(parse);
    },
    flush() {
      const rest = buffer;
      buffer = "";
      return parse(rest);
    },
  };
}
