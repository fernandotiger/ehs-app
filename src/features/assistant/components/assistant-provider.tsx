"use client";

import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { historyForRequest, type ChatTurn } from "@/lib/assistant/history";
import { AssistantRequestError, streamAssistant } from "../api";

/**
 * The chat pop-up's state, held at the app-shell level so the conversation survives moving
 * between pages. Memory only – no localStorage / sessionStorage / IndexedDB / query cache – so it
 * disappears on refresh and on sign-out (the shell unmounts).
 */
interface AssistantContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  turns: ChatTurn[];
  /** An answer is coming in. */
  busy: boolean;
  /** Text typed but not sent yet (kept while the pop-up is closed). */
  draft: string;
  setDraft: (draft: string) => void;
  send: (question: string) => void;
  stop: () => void;
  /** Asks the last question again (after an error or Stop). */
  retry: () => void;
  clear: () => void;
}

const AssistantContext = createContext<AssistantContextValue | null>(null);

let nextId = 0;
const newId = () => `t${Date.now().toString(36)}${(nextId++).toString(36)}`;

export function AssistantProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);

  const update = useCallback((id: string, change: (turn: ChatTurn) => ChatTurn) => {
    setTurns((list) => list.map((t) => (t.id === id ? change(t) : t)));
  }, []);

  /** Streams the answer to `question`, given the turns before it. */
  const ask = useCallback(
    async (before: ChatTurn[], question: string) => {
      const answerId = newId();
      const messages = historyForRequest(before, question);
      setTurns([...before, { id: newId(), role: "user", content: question }, { id: answerId, role: "assistant", content: "", status: "streaming" }]);
      setBusy(true);
      const controller = new AbortController();
      controllerRef.current = controller;
      try {
        await streamAssistant("/api/assistant/chat", { messages, page: pathname }, controller.signal, (event) => {
          if (event.type === "delta") update(answerId, (t) => ({ ...t, content: t.content + event.text }));
          else if (event.type === "done") update(answerId, (t) => ({ ...t, status: "done" }));
          else update(answerId, (t) => ({ ...t, status: "error", error: event.message }));
        });
        // A stream that ended without "done" or "error" was cut off.
        update(answerId, (t) => (t.status === "streaming" ? { ...t, status: "error", error: "The answer was cut off. Please try again." } : t));
      } catch (error) {
        if ((error as Error)?.name === "AbortError" || controller.signal.aborted) {
          update(answerId, (t) => ({ ...t, status: "stopped" }));
        } else {
          const message = error instanceof AssistantRequestError ? error.message : "Something went wrong while getting an answer. Please try again.";
          update(answerId, (t) => ({ ...t, status: "error", error: message }));
        }
      } finally {
        if (controllerRef.current === controller) controllerRef.current = null;
        setBusy(false);
      }
    },
    [pathname, update],
  );

  const send = useCallback(
    (question: string) => {
      const text = question.trim();
      if (!text || controllerRef.current) return;
      setDraft("");
      void ask(turns, text);
    },
    [ask, turns],
  );

  const stop = useCallback(() => controllerRef.current?.abort(), []);

  const retry = useCallback(() => {
    if (controllerRef.current) return;
    let lastQuestion = turns.length - 1;
    while (lastQuestion >= 0 && turns[lastQuestion].role !== "user") lastQuestion--;
    if (lastQuestion === -1) return;
    void ask(turns.slice(0, lastQuestion), turns[lastQuestion].content);
  }, [ask, turns]);

  const clear = useCallback(() => {
    controllerRef.current?.abort();
    setTurns([]);
  }, []);

  const value = useMemo<AssistantContextValue>(
    () => ({ open, setOpen, turns, busy, draft, setDraft, send, stop, retry, clear }),
    [open, turns, busy, draft, send, stop, retry, clear],
  );
  return <AssistantContext.Provider value={value}>{children}</AssistantContext.Provider>;
}

export function useAssistant(): AssistantContextValue {
  const ctx = useContext(AssistantContext);
  if (!ctx) throw new Error("useAssistant must be used inside AssistantProvider");
  return ctx;
}
