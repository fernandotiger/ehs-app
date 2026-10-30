import "server-only";
import { ASSISTANT_STREAM_CONTENT_TYPE, encodeStreamEvent, type AssistantStreamEvent } from "@/lib/assistant/stream-protocol";
import { MODULES } from "@/lib/modules";
import { PERMISSIONS } from "@/lib/permissions";
import type { AssistantConfigDto, AssistantConfigView, AssistantStatusDto } from "@/lib/assistant/types";
import type { AssistantChatInput, AssistantTestInput } from "@/lib/validation/assistant";
import { diff, recordAudit } from "@/server/audit/audit-service";
import { hasCompanyScope } from "@/server/auth/authorization";
import type { CurrentUser } from "@/server/auth/current-user";
import { env } from "@/server/config/env";
import { prisma } from "@/server/db/client";
import type { RequestMeta } from "@/server/http/api-handler";
import { AppError, NotFoundError, StaleVersionError } from "@/server/http/errors";
import { requireTenantId } from "@/server/tenancy/context";
import { defaultAssistantConfig } from "./default-config";
import { DEFAULT_ASSISTANT_KNOWLEDGE } from "./default-knowledge";
import { streamReply, type ChatMessage } from "./openrouter";
import { buildChatMessages, buildSystemPrompt, type PromptContext } from "./prompt";
import { assistantLimiter, rateLimitMessage } from "./rate-limit";

/**
 * AI assistant: per-tenant settings (AssistantConfig, built-in defaults when there is no row) and
 * the streamed answers from OpenRouter. Chat text is never stored, audited or logged.
 */

const CONFIG_FIELDS = ["enabled", "name", "welcomeMessage", "suggestedQuestions", "model", "fallbackModel", "temperature", "maxTokens", "knowledgeText"] as const;

async function load(): Promise<{ id: string | null; value: AssistantConfigDto; version: number }> {
  const row = await prisma.assistantConfig.findFirst();
  if (!row) return { id: null, value: defaultAssistantConfig(), version: 1 };
  const value = Object.fromEntries(CONFIG_FIELDS.map((f) => [f, row[f]])) as AssistantConfigDto;
  return { id: row.id, value, version: row.version };
}

function apiKey(): string | undefined {
  return env().OPENROUTER_API_KEY;
}

function canConfigure(user: CurrentUser): boolean {
  return hasCompanyScope(user, PERMISSIONS.ADMIN_SETTINGS);
}

/** The guide is audited by size only – it can be tens of thousands of characters. */
function auditChanges(before: AssistantConfigDto, after: AssistantConfigDto) {
  const changes = diff(before as unknown as Record<string, unknown>, after as unknown as Record<string, unknown>, CONFIG_FIELDS.filter((f) => f !== "knowledgeText"));
  if (before.knowledgeText !== after.knowledgeText) {
    const size = (text: string) => `${text.length.toLocaleString("en-IE")} characters`;
    return { ...changes, knowledgeText: { from: size(before.knowledgeText), to: size(after.knowledgeText) } };
  }
  return changes;
}

function promptContext(user: CurrentUser, config: Pick<AssistantConfigDto, "name" | "knowledgeText">, page?: string): PromptContext {
  return {
    assistantName: config.name,
    organizationName: user.organizationName,
    knowledgeText: config.knowledgeText,
    userName: user.name,
    roleNames: user.roleNames,
    moduleNames: user.enabledModules.map((m) => MODULES[m]?.name).filter(Boolean),
    page,
  };
}

function requireKey(): string {
  const key = apiKey();
  if (!key) throw new AppError("The assistant isn't set up yet – your administrator needs to add the AI service key.", 503, "ASSISTANT_NOT_CONFIGURED");
  return key;
}

function checkRate(user: CurrentUser) {
  const decision = assistantLimiter.hit(`${user.organizationId}:${user.id}`);
  if (!decision.ok) throw new AppError(rateLimitMessage(decision.retryAfterSeconds), 429, "RATE_LIMITED", { retryAfterSeconds: decision.retryAfterSeconds });
}

function appUrl(): string | undefined {
  return env().BETTER_AUTH_URL;
}

/** NDJSON response that streams the events; stops the OpenRouter request when the browser goes away. */
function streamResponse(start: (signal: AbortSignal) => AsyncGenerator<AssistantStreamEvent>, requestSignal: AbortSignal): Response {
  const stop = new AbortController();
  const signal = AbortSignal.any([requestSignal, stop.signal]);
  const events = start(signal);
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { value, done } = await events.next();
        if (done) controller.close();
        else controller.enqueue(encoder.encode(encodeStreamEvent(value)));
      } catch (error) {
        // Never log the conversation or the key – only that a stream failed.
        console.error("[assistant] stream failed:", error instanceof Error ? error.name : "unknown");
        controller.enqueue(encoder.encode(encodeStreamEvent({ type: "error", code: "error", message: "Something went wrong while getting an answer. Please try again.", partial: false })));
        controller.close();
      }
    },
    async cancel() {
      stop.abort();
      await events.return(undefined);
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": ASSISTANT_STREAM_CONTENT_TYPE,
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}

function reply(
  key: string,
  config: Pick<AssistantConfigDto, "model" | "fallbackModel" | "temperature" | "maxTokens">,
  messages: ChatMessage[],
  requestSignal: AbortSignal,
): Response {
  return streamResponse(
    (signal) =>
      streamReply({
        apiKey: key,
        models: [config.model, config.fallbackModel ?? ""],
        messages,
        temperature: config.temperature,
        maxTokens: config.maxTokens,
        signal,
        appUrl: appUrl(),
        appTitle: "OleoQ EHS",
      }),
    requestSignal,
  );
}

export const assistantService = {
  async status(user: CurrentUser): Promise<AssistantStatusDto> {
    const { value } = await load();
    const state = !value.enabled ? "disabled" : apiKey() ? "ready" : "not-configured";
    return {
      state,
      name: value.name,
      welcomeMessage: value.welcomeMessage,
      suggestedQuestions: value.suggestedQuestions,
      canConfigure: canConfigure(user),
    };
  },

  async getForEditing(): Promise<AssistantConfigView> {
    const { value, version } = await load();
    return { value, version, keyConfigured: Boolean(apiKey()), defaultKnowledgeText: DEFAULT_ASSISTANT_KNOWLEDGE.trim() };
  },

  /** Saves the settings; 409 STALE_VERSION when someone else saved first. Audited (the guide by size). */
  async update(input: AssistantConfigDto, expectedVersion: number, actor: CurrentUser, meta: RequestMeta): Promise<AssistantConfigView> {
    const organizationId = requireTenantId();
    await prisma.$transaction(async (tx) => {
      const row = await tx.assistantConfig.findFirst();
      const current = row?.version ?? 1;
      if (expectedVersion !== current) throw new StaleVersionError();
      const before = row ? (Object.fromEntries(CONFIG_FIELDS.map((f) => [f, row[f]])) as AssistantConfigDto) : defaultAssistantConfig();
      let id: string;
      if (row) {
        const updated = await tx.assistantConfig.updateMany({
          where: { id: row.id, version: current },
          data: { ...input, updatedById: actor.id, version: { increment: 1 } },
        });
        if (updated.count === 0) throw new StaleVersionError();
        id = row.id;
      } else {
        const created = await tx.assistantConfig.create({ data: { organizationId, ...input, updatedById: actor.id, version: 2 } });
        id = created.id;
      }
      await recordAudit(
        { entityType: "AssistantConfig", entityId: id, action: "ASSISTANT_CONFIG_UPDATED", actor, changes: auditChanges(before, input), meta },
        tx,
      );
    });
    return this.getForEditing();
  },

  /** POST /api/assistant/chat – streams the answer to the last question. */
  async chat(user: CurrentUser, input: AssistantChatInput, signal: AbortSignal): Promise<Response> {
    const { value } = await load();
    if (!value.enabled) throw new NotFoundError("The assistant is switched off for your company.");
    const key = requireKey();
    checkRate(user);
    return reply(key, value, buildChatMessages(promptContext(user, value, input.page), input.messages), signal);
  },

  /** Configuration test box – one question against the unsaved settings on screen (also rate-limited). */
  async test(user: CurrentUser, input: AssistantTestInput, signal: AbortSignal): Promise<Response> {
    const key = requireKey();
    checkRate(user);
    const messages: ChatMessage[] = [
      { role: "system", content: buildSystemPrompt(promptContext(user, input.config, "/configuration/assistant")) },
      { role: "user", content: input.question },
    ];
    return reply(key, input.config, messages, signal);
  },
};
