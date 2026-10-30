"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createStreamEventDecoder, type AssistantStreamEvent } from "@/lib/assistant/stream-protocol";
import type { AssistantConfigDto, AssistantConfigView, AssistantStatusDto } from "@/lib/assistant/types";
import { api } from "@/lib/api-client";

/** AI assistant – query keys, hooks and the streamed-answer reader. Nothing here is persisted. */

export const assistantKeys = {
  status: ["assistant", "status"] as const,
  config: ["assistant", "config"] as const,
};

const noPersist = { persist: false };

export function useAssistantStatus() {
  return useQuery({
    queryKey: assistantKeys.status,
    queryFn: ({ signal }) => api.get<AssistantStatusDto>("/api/assistant", undefined, signal),
    staleTime: 5 * 60_000,
    meta: noPersist,
  });
}

export function useAssistantConfig() {
  return useQuery({
    queryKey: assistantKeys.config,
    queryFn: ({ signal }) => api.get<AssistantConfigView>("/api/configuration/assistant", undefined, signal),
    staleTime: 0,
    meta: noPersist,
  });
}

export function useSaveAssistantConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { value: AssistantConfigDto; expectedVersion: number }) => api.put<AssistantConfigView>("/api/configuration/assistant", input),
    onSuccess: (data) => {
      qc.setQueryData(assistantKeys.config, data);
      void qc.invalidateQueries({ queryKey: assistantKeys.status });
    },
  });
}

/** A request the server refused before answering (not signed in, too many questions, not set up …). */
export class AssistantRequestError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "AssistantRequestError";
  }
}

function refusalMessage(status: number, error: { message?: string; code?: string; details?: unknown } | undefined): string {
  if (error?.code === "VALIDATION_ERROR" && Array.isArray(error.details) && error.details.length) {
    const first = error.details[0] as { message?: string };
    if (first.message) return first.message;
  }
  if (error?.message) return error.message;
  if (status === 404) return "The assistant is switched off for your company.";
  return "Something went wrong while getting an answer. Please try again.";
}

/**
 * POSTs to an assistant endpoint and calls `onEvent` for every streamed event.
 * Throws AssistantRequestError when the server refuses, and the AbortError when `signal` aborts.
 */
export async function streamAssistant(path: string, body: unknown, signal: AbortSignal, onEvent: (event: AssistantStreamEvent) => void): Promise<void> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/x-ndjson" },
      body: JSON.stringify(body),
      signal,
      credentials: "same-origin",
      cache: "no-store",
    });
  } catch (error) {
    if ((error as Error)?.name === "AbortError") throw error;
    throw new AssistantRequestError("You appear to be offline – check your connection and try again.", "NETWORK_ERROR", 0);
  }

  if (!res.ok || !res.body) {
    const data = (await res.json().catch(() => null)) as { error?: { message?: string; code?: string; details?: unknown } } | null;
    if (res.status === 401) window.dispatchEvent(new CustomEvent("ehs:unauthorized"));
    throw new AssistantRequestError(refusalMessage(res.status, data?.error), data?.error?.code ?? "HTTP_ERROR", res.status);
  }

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  const decoder = createStreamEventDecoder();
  // Stop ends the wait at once, whatever the body does.
  const aborted = new Promise<never>((_, reject) => {
    const fail = () => reject(new DOMException("The answer was stopped", "AbortError"));
    if (signal.aborted) fail();
    else signal.addEventListener("abort", fail, { once: true });
  });
  aborted.catch(() => undefined);
  try {
    while (true) {
      const { value, done } = await Promise.race([reader.read(), aborted]);
      if (done) break;
      for (const event of decoder.push(value)) onEvent(event);
    }
  } catch (error) {
    void reader.cancel().catch(() => undefined);
    if ((error as Error)?.name === "AbortError" || signal.aborted) throw error;
    throw new AssistantRequestError("The connection dropped while the answer was coming in. Please try again.", "NETWORK_ERROR", 0);
  }
  for (const event of decoder.flush()) onEvent(event);
}
