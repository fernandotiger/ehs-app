import { describe, expect, it } from "vitest";
import type { AssistantStreamEvent } from "@/lib/assistant/stream-protocol";
import { createSseParser, mapOpenRouterError, mapStreamError, OPENROUTER_CHAT_URL, streamReply, type ReplyRequest } from "./openrouter";

const KEY = "sk-or-v1-test-key";

/** A streamed SSE response made of the given raw text pieces. */
function sse(pieces: string[], { delayMs = 0, hang = false } = {}): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      for (const piece of pieces) {
        if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
        controller.enqueue(encoder.encode(piece));
      }
      if (!hang) controller.close();
    },
  });
  return new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } });
}

const delta = (text: string, model = "vendor/model:free") => `data: ${JSON.stringify({ id: "gen-1", model, choices: [{ index: 0, delta: { content: text } }] })}\n\n`;
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

interface Call {
  url: string;
  init: RequestInit;
  body: Record<string, unknown>;
}

/** A fake fetch that answers each call with the next response (or throws it). */
function fakeFetch(responses: (Response | Error | ((init: RequestInit) => Promise<Response>))[]) {
  const calls: Call[] = [];
  const impl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init, body: JSON.parse(String(init.body)) });
    const next = responses.shift();
    if (!next) throw new Error("unexpected call");
    if (next instanceof Error) throw next;
    if (typeof next === "function") return next(init);
    return next;
  }) as unknown as typeof fetch;
  return { impl, calls };
}

async function collect(req: Partial<ReplyRequest> & Pick<ReplyRequest, "fetchImpl">): Promise<AssistantStreamEvent[]> {
  const events: AssistantStreamEvent[] = [];
  for await (const event of streamReply({
    apiKey: KEY,
    models: ["openrouter/free", "google/gemma-4-31b-it:free"],
    messages: [{ role: "user", content: "How do I report an incident?" }],
    temperature: 0.3,
    maxTokens: 500,
    ...req,
  })) {
    events.push(event);
  }
  return events;
}

const text = (events: AssistantStreamEvent[]) => events.flatMap((e) => (e.type === "delta" ? [e.text] : [])).join("");

describe("mapOpenRouterError", () => {
  it("maps statuses to plain messages and decides whether the fallback is worth trying", () => {
    expect(mapOpenRouterError(401, { error: { code: 401, message: "No auth credentials found" } })).toMatchObject({ code: "not_connected", tryFallback: false });
    expect(mapOpenRouterError(402, { error: { code: 402, message: "Insufficient credits" } })).toMatchObject({ code: "no_credit", tryFallback: false });
    expect(mapOpenRouterError(429, { error: { code: 429, message: "Rate limit exceeded", metadata: { error_type: "rate_limit_exceeded" } } })).toMatchObject({ code: "busy", tryFallback: true });
    expect(mapOpenRouterError(404, { error: { code: 404, message: "No endpoints found for x/y:free" } })).toMatchObject({ code: "unavailable", tryFallback: true });
    expect(mapOpenRouterError(502, {})).toMatchObject({ code: "unavailable", tryFallback: true });
    expect(mapOpenRouterError(503, null)).toMatchObject({ code: "unavailable", tryFallback: true });
    expect(mapOpenRouterError(408, {})).toMatchObject({ code: "timeout", tryFallback: true });
    expect(mapOpenRouterError(504, {})).toMatchObject({ code: "timeout", tryFallback: true });
    expect(mapOpenRouterError(403, { error: { code: 403, message: "flagged", metadata: { reasons: ["x"] } } })).toMatchObject({ code: "declined", tryFallback: false });
    expect(mapOpenRouterError(403, { error: { code: 403, message: "Budget", metadata: { limit_source: "key" } } })).toMatchObject({ code: "no_credit" });
    expect(mapOpenRouterError(400, { error: { code: 400, message: "Bad request" } })).toMatchObject({ code: "error", tryFallback: false });
    expect(mapOpenRouterError(500, {})).toMatchObject({ code: "error", tryFallback: true });
  });

  it("recognises the data-policy and context-length problems whatever the status", () => {
    expect(mapOpenRouterError(404, { error: { message: "No endpoints found matching your data policy (Free model publication)" } })).toMatchObject({ code: "policy", tryFallback: false });
    expect(mapOpenRouterError(400, { error: { message: "This endpoint's maximum context length is 8192 tokens" } })).toMatchObject({ code: "too_long", tryFallback: true });
  });

  it("gives every failure a plain message without technical details", () => {
    const failure = mapOpenRouterError(429, { error: { message: "Rate limit exceeded: free-models-per-day" } });
    expect(failure.message).toMatch(/busy/i);
    expect(failure.message).not.toMatch(/free-models-per-day|429/);
  });

  it("maps a mid-stream error chunk by its code", () => {
    expect(mapStreamError({ error: { code: 502, message: "Provider disconnected" }, choices: [{ finish_reason: "error" }] })).toMatchObject({ code: "unavailable", tryFallback: true });
    expect(mapStreamError({ error: { code: "server_error", message: "x" } })).toMatchObject({ code: "error" });
  });
});

describe("createSseParser", () => {
  it("parses data events, skips comments and stops at [DONE]", () => {
    const parser = createSseParser();
    const items = parser.push(`: OPENROUTER PROCESSING\n\n${delta("Hello")}data: [DONE]\n\n`);
    expect(items).toEqual([{ done: false, data: expect.objectContaining({ model: "vendor/model:free" }) }, { done: true }]);
  });

  it("keeps an event split across chunks and accepts CRLF line endings", () => {
    const parser = createSseParser();
    const event = delta("Split").replace(/\n/g, "\r\n");
    expect(parser.push(event.slice(0, 20))).toEqual([]);
    const items = parser.push(event.slice(20));
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ done: false });
  });

  it("joins multi-line data fields and ignores broken JSON", () => {
    const parser = createSseParser();
    expect(parser.push('data: {"a":\ndata: 1}\n\ndata: {broken\n\n')).toEqual([{ done: false, data: { a: 1 } }]);
  });
});

describe("streamReply", () => {
  it("streams the text and finishes with the model that answered", async () => {
    const { impl, calls } = fakeFetch([sse([": OPENROUTER PROCESSING\n\n", delta("Open **Incidents"), delta(" → Report incident**."), "data: [DONE]\n\n"])]);
    const events = await collect({ fetchImpl: impl, appUrl: "https://app.example", appTitle: "OleoQ EHS" });
    expect(text(events)).toBe("Open **Incidents → Report incident**.");
    expect(events.at(-1)).toEqual({ type: "done", model: "vendor/model:free" });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(OPENROUTER_CHAT_URL);
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${KEY}`);
    expect(headers["HTTP-Referer"]).toBe("https://app.example");
    expect(headers["X-OpenRouter-Title"]).toBe("OleoQ EHS");
    expect(calls[0].body).toMatchObject({ model: "openrouter/free", stream: true, temperature: 0.3, max_tokens: 500 });
    // The key travels only in the Authorization header – never in the events.
    expect(JSON.stringify(events)).not.toContain(KEY);
  });

  it("tries the fallback model when the main one is rate-limited before answering", async () => {
    const { impl, calls } = fakeFetch([json(429, { error: { code: 429, message: "Rate limit exceeded" } }), sse([delta("From the fallback", "google/gemma-4-31b-it:free"), "data: [DONE]\n\n"])]);
    const events = await collect({ fetchImpl: impl });
    expect(calls.map((c) => c.body.model)).toEqual(["openrouter/free", "google/gemma-4-31b-it:free"]);
    expect(text(events)).toBe("From the fallback");
    expect(events.at(-1)).toEqual({ type: "done", model: "google/gemma-4-31b-it:free" });
  });

  it("tries the fallback after a mid-stream error that came before any text, or an empty answer", async () => {
    const midStream = `data: ${JSON.stringify({ error: { code: 502, message: "Provider disconnected" }, choices: [{ finish_reason: "error" }] })}\n\n`;
    const first = fakeFetch([sse([midStream]), sse([delta("Second try"), "data: [DONE]\n\n"])]);
    expect(text(await collect({ fetchImpl: first.impl }))).toBe("Second try");

    const empty = fakeFetch([sse(["data: [DONE]\n\n"]), sse([delta("Not empty"), "data: [DONE]\n\n"])]);
    expect(text(await collect({ fetchImpl: empty.impl }))).toBe("Not empty");
    expect(empty.calls).toHaveLength(2);
  });

  it("does not use the fallback for account problems", async () => {
    const { impl, calls } = fakeFetch([json(401, { error: { code: 401, message: "User not found." } })]);
    const events = await collect({ fetchImpl: impl });
    expect(calls).toHaveLength(1);
    expect(events).toEqual([{ type: "error", code: "not_connected", message: expect.stringMatching(/administrator/), partial: false }]);
  });

  it("ends a cut-off answer with a partial error instead of starting again", async () => {
    const midStream = `data: ${JSON.stringify({ error: { code: 502, message: "Provider disconnected" }, choices: [{ finish_reason: "error" }] })}\n\n`;
    const { impl, calls } = fakeFetch([sse([delta("Half an"), midStream])]);
    const events = await collect({ fetchImpl: impl });
    expect(calls).toHaveLength(1);
    expect(text(events)).toBe("Half an");
    expect(events.at(-1)).toMatchObject({ type: "error", code: "unavailable", partial: true });
  });

  it("reports the last failure when every model fails", async () => {
    const { impl } = fakeFetch([json(503, {}), json(429, { error: { message: "Rate limit exceeded" } })]);
    expect(await collect({ fetchImpl: impl })).toEqual([{ type: "error", code: "busy", message: expect.any(String), partial: false }]);
  });

  it("maps network failures and silent streams to plain errors", async () => {
    const network = fakeFetch([new TypeError("fetch failed")]);
    expect(await collect({ fetchImpl: network.impl, models: ["openrouter/free"] })).toEqual([{ type: "error", code: "network", message: expect.any(String), partial: false }]);

    const silent = fakeFetch([sse([": OPENROUTER PROCESSING\n\n"], { hang: true })]);
    const events = await collect({ fetchImpl: silent.impl, models: ["openrouter/free"], timeouts: { idleMs: 30 } });
    expect(events).toEqual([{ type: "error", code: "timeout", message: expect.any(String), partial: false }]);
  });

  it("times out a request that never answers and then tries the fallback", async () => {
    const neverAnswers = (init: RequestInit) =>
      new Promise<Response>((_, reject) => init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))));
    const { impl } = fakeFetch([neverAnswers, sse([delta("Fallback was quick"), "data: [DONE]\n\n"])]);
    expect(text(await collect({ fetchImpl: impl, timeouts: { connectMs: 20 } }))).toBe("Fallback was quick");
  });

  it("stops quietly when the person presses Stop", async () => {
    const controller = new AbortController();
    const { impl } = fakeFetch([sse([delta("One "), delta("two "), delta("three")], { delayMs: 20, hang: true })]);
    const events: AssistantStreamEvent[] = [];
    for await (const event of streamReply({ apiKey: KEY, models: ["openrouter/free"], messages: [], temperature: 0, maxTokens: 100, fetchImpl: impl, signal: controller.signal })) {
      events.push(event);
      controller.abort();
    }
    expect(events).toEqual([{ type: "delta", text: "One " }]);
  });

  it("skips an empty or repeated fallback model", async () => {
    const { impl, calls } = fakeFetch([json(503, {})]);
    await collect({ fetchImpl: impl, models: ["openrouter/free", "", "openrouter/free"] });
    expect(calls).toHaveLength(1);
  });
});
