import type { AssistantErrorCode, AssistantStreamEvent } from "@/lib/assistant/stream-protocol";

/**
 * OpenRouter chat completions over plain fetch (no SDK): request, SSE parsing, error mapping and
 * the model fallback. Pure apart from `fetchImpl`, so it is unit-tested with a fake fetch.
 * Docs: https://openrouter.ai/docs/api/reference/streaming, …/errors-and-debugging, …/limits.
 */

export const OPENROUTER_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface UpstreamFailure {
  code: AssistantErrorCode;
  /** Plain words for the person asking. */
  message: string;
  /** Worth trying the fallback model (this model or its provider is the problem, not the account). */
  tryFallback: boolean;
}

const MESSAGES: Record<AssistantErrorCode, string> = {
  busy: "The assistant is busy right now – too many questions in a short time. Please wait a minute and try again. If this keeps happening, the free daily limit may have been reached; try again tomorrow or tell your administrator.",
  no_credit: "The AI service has run out of credit, so the assistant can't answer at the moment. Please tell your administrator.",
  not_connected: "The assistant isn't connected properly (the AI service refused the key). Please tell your administrator.",
  policy: "The assistant isn't set up correctly yet: the AI account's privacy settings block the chosen free model. Please tell your administrator.",
  declined: "The AI service declined to answer this question. Try asking it in a different way.",
  unavailable: "The AI model is unavailable right now. Please try again in a moment.",
  timeout: "The assistant took too long to answer. Please try again.",
  too_long: "This conversation is too long for the assistant. Clear the conversation and ask again.",
  empty: "The assistant didn't send an answer. Please try again.",
  network: "The AI service couldn't be reached. Please try again in a moment.",
  error: "Something went wrong while getting an answer. Please try again.",
};

export function failure(code: AssistantErrorCode, tryFallback = false): UpstreamFailure {
  return { code, message: MESSAGES[code], tryFallback };
}

interface OpenRouterErrorBody {
  code?: number | string;
  message?: string;
  metadata?: Record<string, unknown> | null;
}

function errorOf(body: unknown): OpenRouterErrorBody {
  if (body && typeof body === "object" && "error" in body) {
    const error = (body as { error: unknown }).error;
    if (error && typeof error === "object") return error as OpenRouterErrorBody;
    if (typeof error === "string") return { message: error };
  }
  return {};
}

/** Maps an OpenRouter error (HTTP status + JSON body, or a mid-stream error object) to plain words. */
export function mapOpenRouterError(status: number, body: unknown): UpstreamFailure {
  const error = errorOf(body);
  const text = `${error.message ?? ""} ${JSON.stringify(error.metadata ?? {})}`.toLowerCase();
  const errorType = typeof error.metadata?.error_type === "string" ? error.metadata.error_type : "";

  if (text.includes("data policy") || text.includes("privacy")) return failure("policy");
  if (text.includes("context length") || text.includes("context_length") || text.includes("maximum context") || errorType === "context_length_exceeded") {
    return failure("too_long", true);
  }
  switch (status) {
    case 401:
      return failure("not_connected");
    case 402:
      return failure("no_credit");
    case 403:
      return error.metadata && "limit_source" in error.metadata ? failure("no_credit") : failure("declined");
    case 404:
      return failure("unavailable", true);
    case 408:
    case 504:
      return failure("timeout", true);
    case 413:
      return failure("too_long", true);
    case 429:
      return failure("busy", true);
    case 502:
    case 503:
      return failure("unavailable", true);
    default:
      if (errorType.includes("rate_limit")) return failure("busy", true);
      return failure("error", status >= 500);
  }
}

/** A mid-stream error chunk: `{ error: { code, message }, choices: [{ finish_reason: "error" }] }` (HTTP status was 200). */
export function mapStreamError(chunk: Record<string, unknown>): UpstreamFailure {
  const error = errorOf(chunk);
  const status = typeof error.code === "number" ? error.code : Number(error.code) || 500;
  return mapOpenRouterError(status, chunk);
}

/** One parsed SSE event: a JSON chunk, or the end marker. Comment lines (": OPENROUTER PROCESSING") are dropped. */
export type SseItem = { done: true } | { done: false; data: Record<string, unknown> };

/** Incremental SSE parser (handles \r\n, events split across chunks and multi-line data fields). */
export function createSseParser(): { push(chunk: string): SseItem[] } {
  let buffer = "";
  return {
    push(chunk) {
      buffer += chunk.replace(/\r\n?/g, "\n");
      const items: SseItem[] = [];
      let end = buffer.indexOf("\n\n");
      while (end !== -1) {
        const block = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        const data = block
          .split("\n")
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).replace(/^ /, ""))
          .join("\n");
        if (data === "[DONE]") items.push({ done: true });
        else if (data) {
          try {
            const parsed: unknown = JSON.parse(data);
            if (parsed && typeof parsed === "object") items.push({ done: false, data: parsed as Record<string, unknown> });
          } catch {
            // A broken chunk is skipped rather than failing the whole answer.
          }
        }
        end = buffer.indexOf("\n\n");
      }
      return items;
    },
  };
}

export interface ReplyRequest {
  apiKey: string;
  /** Main model first, then the fallback (each tried once). */
  models: string[];
  messages: ChatMessage[];
  temperature: number;
  maxTokens: number;
  /** Aborted when the person presses Stop or closes the page. */
  signal?: AbortSignal;
  /** Sent as HTTP-Referer (OpenRouter app attribution). */
  appUrl?: string;
  appTitle?: string;
  fetchImpl?: typeof fetch;
  timeouts?: Partial<ReplyTimeouts>;
}

export interface ReplyTimeouts {
  /** Until OpenRouter answers with headers. */
  connectMs: number;
  /** Silence between two chunks (keep-alive comments count as activity). */
  idleMs: number;
  /** Whole answer, all attempts. */
  totalMs: number;
}

export const DEFAULT_TIMEOUTS: ReplyTimeouts = { connectMs: 25_000, idleMs: 45_000, totalMs: 110_000 };

class TimeoutSignal extends Error {}

/**
 * Streams the answer as AssistantStreamEvents. Tries each model in turn when the previous one
 * fails before sending any text (busy, unavailable, timeout, empty answer); once text has been
 * streamed a failure ends the answer with `partial: true`. Stops quietly when `signal` aborts.
 */
export async function* streamReply(req: ReplyRequest): AsyncGenerator<AssistantStreamEvent> {
  const fetchImpl = req.fetchImpl ?? fetch;
  const timeouts = { ...DEFAULT_TIMEOUTS, ...req.timeouts };
  const deadline = Date.now() + timeouts.totalMs;
  const models = [...new Set(req.models.filter(Boolean))];

  for (let i = 0; i < models.length; i++) {
    const last = i === models.length - 1;
    const attempt = new AbortController();
    const onAbort = () => attempt.abort();
    req.signal?.addEventListener("abort", onAbort, { once: true });
    let timer: ReturnType<typeof setTimeout> | undefined;
    const arm = (ms: number) => {
      clearTimeout(timer);
      timer = setTimeout(() => attempt.abort(new TimeoutSignal()), Math.max(0, Math.min(ms, deadline - Date.now())));
    };

    let outcome: UpstreamFailure | "done" = failure("error");
    let sent = false;
    let usedModel: string | null = null;
    // Ends any wait (headers, a chunk, an error body) as soon as the attempt is aborted.
    const aborted = new Promise<never>((_, reject) => {
      attempt.signal.addEventListener("abort", () => reject(attempt.signal.reason), { once: true });
    });
    aborted.catch(() => undefined);
    try {
      if (req.signal?.aborted) return;
      arm(timeouts.connectMs);
      const request = fetchImpl(OPENROUTER_CHAT_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${req.apiKey}`,
          "Content-Type": "application/json",
          Accept: "text/event-stream",
          ...(req.appUrl ? { "HTTP-Referer": req.appUrl } : {}),
          ...(req.appTitle ? { "X-OpenRouter-Title": req.appTitle, "X-Title": req.appTitle } : {}),
        },
        body: JSON.stringify({
          model: models[i],
          messages: req.messages,
          stream: true,
          temperature: req.temperature,
          max_tokens: req.maxTokens,
        }),
        signal: attempt.signal,
      });
      const res = await Promise.race([request, aborted]);

      if (!res.ok || !res.body) {
        const body: unknown = await Promise.race([res.json().catch(() => null), aborted]);
        outcome = mapOpenRouterError(res.status, body);
      } else {
        outcome = "done";
        const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
        const parser = createSseParser();
        read: while (true) {
          arm(timeouts.idleMs);
          const { value, done } = await Promise.race([reader.read(), aborted]);
          if (done) break;
          for (const item of parser.push(value)) {
            if (item.done) break read;
            const chunk = item.data;
            if (chunk.error) {
              outcome = mapStreamError(chunk);
              break read;
            }
            if (typeof chunk.model === "string") usedModel = chunk.model;
            const choice = (chunk.choices as { delta?: { content?: unknown } }[] | undefined)?.[0];
            const text = choice?.delta?.content;
            if (typeof text === "string" && text.length > 0) {
              sent = true;
              yield { type: "delta", text };
            }
          }
        }
        await reader.cancel().catch(() => undefined);
        if (outcome === "done" && !sent) outcome = failure("empty", true);
      }
    } catch {
      if (req.signal?.aborted) return;
      const reason: unknown = attempt.signal.reason;
      outcome = reason instanceof TimeoutSignal ? failure("timeout", true) : failure("network", true);
    } finally {
      clearTimeout(timer);
      req.signal?.removeEventListener("abort", onAbort);
      // Also ends the upstream request when the consumer stops reading early (Stop / page closed).
      attempt.abort();
    }

    if (outcome === "done") {
      yield { type: "done", model: usedModel ?? models[i] };
      return;
    }
    if (!sent && outcome.tryFallback && !last && Date.now() < deadline) continue;
    yield { type: "error", code: outcome.code, message: outcome.message, partial: sent };
    return;
  }
}
