"use client";

import { AlertCircle, ArrowUp, KeyRound, RotateCw, Sparkles, Square, SquarePen, X } from "lucide-react";
import Link from "next/link";
import { Dialog as DialogPrimitive } from "radix-ui";
import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import { Button } from "@/components/ui/button";
import { ASSISTANT_KEY_ENV, ASSISTANT_LIMITS } from "@/lib/assistant/defaults";
import type { ChatTurn } from "@/lib/assistant/history";
import type { AssistantStatusDto } from "@/lib/assistant/types";
import { cn } from "@/lib/utils";
import { AssistantMarkdown } from "./assistant-markdown";
import { useAssistant } from "./assistant-provider";

/** The pop-up's content: header, conversation (or the set-up hint for admins) and the question box. */
export function AssistantPanel({
  status,
  inputRef,
  onNavigate,
}: {
  status: AssistantStatusDto;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  /** A link in an answer was followed (phones close the sheet so the page shows). */
  onNavigate: () => void;
}) {
  const { turns, clear, busy } = useAssistant();
  const ready = status.state === "ready";

  return (
    <>
      <header className="flex shrink-0 items-center gap-3 bg-linear-to-br from-brand to-brand-dark px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] text-brand-foreground">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-white/15 ring-1 ring-white/25" aria-hidden>
          <Sparkles className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <DialogPrimitive.Title className="truncate text-sm font-semibold leading-tight">{status.name}</DialogPrimitive.Title>
          <DialogPrimitive.Description className="truncate text-xs opacity-85">
            {ready ? (busy ? "Writing an answer…" : "Help with using OleoQ") : "Not set up yet"}
          </DialogPrimitive.Description>
        </div>
        {ready && turns.length > 0 && (
          <HeaderButton label="Start a new conversation" onClick={clear}>
            <SquarePen className="size-4.5" />
          </HeaderButton>
        )}
        <DialogPrimitive.Close asChild>
          <HeaderButton label="Close">
            <X className="size-5" />
          </HeaderButton>
        </DialogPrimitive.Close>
      </header>
      {ready ? (
        <>
          <Conversation status={status} onNavigate={onNavigate} />
          <Composer inputRef={inputRef} />
        </>
      ) : (
        <NotConfigured />
      )}
    </>
  );
}

function HeaderButton({ label, children, ...props }: { label: string; children: React.ReactNode } & React.ComponentProps<"button">) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className="grid size-9 shrink-0 place-items-center rounded-full text-brand-foreground/90 transition-colors hover:bg-white/15 hover:text-brand-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
      {...props}
    >
      {children}
    </button>
  );
}

function Conversation({ status, onNavigate }: { status: AssistantStatusDto; onNavigate: () => void }) {
  const { turns, send, retry, busy } = useAssistant();
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const lastTurn = turns[turns.length - 1];

  // Follow the answer as it streams in, unless the person scrolled up to read.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [turns]);

  // A new question always brings the view down.
  useEffect(() => {
    if (lastTurn?.role === "assistant" && lastTurn.status === "streaming" && lastTurn.content === "") stickToBottom.current = true;
  }, [lastTurn]);

  return (
    <div
      ref={scrollRef}
      onScroll={(e) => {
        const el = e.currentTarget;
        stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
      }}
      className="flex-1 space-y-4 overflow-y-auto overscroll-contain bg-muted/30 px-4 py-4"
      role="log"
      aria-label="Conversation"
    >
      <AssistantBubble>
        <p>{status.welcomeMessage}</p>
      </AssistantBubble>
      {turns.length === 0 && status.suggestedQuestions.length > 0 && (
        <div className="space-y-2 pl-10">
          <p className="text-xs font-medium text-muted-foreground">Try asking</p>
          <div className="flex flex-col items-start gap-2">
            {status.suggestedQuestions.map((q) => (
              <button
                key={q}
                type="button"
                disabled={busy}
                onClick={() => send(q)}
                className="rounded-2xl border border-brand/25 bg-card px-3 py-1.5 text-left text-sm text-brand shadow-xs transition-colors hover:border-brand/50 hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 disabled:opacity-50 dark:text-brand-light"
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      )}
      {turns.map((turn) =>
        turn.role === "user" ? (
          <UserBubble key={turn.id} text={turn.content} />
        ) : (
          <AnswerBubble key={turn.id} turn={turn} isLast={turn === lastTurn} onRetry={retry} onNavigate={onNavigate} />
        ),
      )}
    </div>
  );
}

function AssistantBubble({ children, busy, className }: { children: React.ReactNode; busy?: boolean; className?: string }) {
  return (
    <div className="flex items-end gap-2" aria-busy={busy || undefined}>
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-soft text-brand dark:text-brand-light" aria-hidden>
        <Sparkles className="size-4" />
      </span>
      <div className={cn("min-w-0 max-w-[85%] rounded-2xl rounded-bl-md border bg-card px-3.5 py-2.5 text-sm leading-relaxed shadow-xs", className)}>
        <span className="sr-only">Assistant: </span>
        {children}
      </div>
    </div>
  );
}

function UserBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-brand px-3.5 py-2.5 text-sm leading-relaxed text-brand-foreground shadow-xs">
        <span className="sr-only">You: </span>
        {text}
      </div>
    </div>
  );
}

function AnswerBubble({ turn, isLast, onRetry, onNavigate }: { turn: ChatTurn; isLast: boolean; onRetry: () => void; onNavigate: () => void }) {
  const streaming = turn.status === "streaming";
  const failed = turn.status === "error";
  const stopped = turn.status === "stopped";
  return (
    <AssistantBubble busy={streaming}>
      {streaming && !turn.content ? (
        <TypingDots />
      ) : (
        turn.content && (
          <div className={cn(streaming && "assistant-caret")}>
            <AssistantMarkdown text={turn.content} onNavigate={onNavigate} />
          </div>
        )
      )}
      {failed && (
        <div role="alert" className={cn("flex items-start gap-2 text-destructive", turn.content && "mt-2 border-t pt-2")}>
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>{turn.error}</p>
        </div>
      )}
      {stopped && <p className={cn("text-xs text-muted-foreground", turn.content && "mt-2")}>You stopped this answer.</p>}
      {(failed || stopped) && isLast && (
        <Button type="button" size="sm" variant="outline" className="mt-2 h-8" onClick={onRetry}>
          <RotateCw /> Try again
        </Button>
      )}
    </AssistantBubble>
  );
}

function TypingDots() {
  return (
    <span className="flex h-5 items-center gap-1" role="status">
      <span className="sr-only">The assistant is typing</span>
      {[0, 150, 300].map((delay) => (
        <span
          key={delay}
          className="size-2 animate-bounce rounded-full bg-brand/60 motion-reduce:animate-pulse"
          style={{ animationDelay: `${delay}ms` }}
          aria-hidden
        />
      ))}
    </span>
  );
}

function Composer({ inputRef }: { inputRef: RefObject<HTMLTextAreaElement | null> }) {
  const { draft, setDraft, send, stop, busy } = useAssistant();
  const canSend = draft.trim().length > 0 && !busy;

  // Grow with the text up to ~5 lines.
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
  }, [draft, inputRef]);

  return (
    <form
      className="shrink-0 border-t bg-card px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (canSend) send(draft);
      }}
    >
      <div className="flex items-end gap-2 rounded-2xl border bg-background py-1.5 pl-3.5 pr-1.5 transition-shadow focus-within:border-brand/50 focus-within:ring-3 focus-within:ring-brand/20">
        <label htmlFor="assistant-question" className="sr-only">
          Ask a question about using OleoQ
        </label>
        <textarea
          id="assistant-question"
          ref={inputRef}
          rows={1}
          value={draft}
          maxLength={ASSISTANT_LIMITS.messageChars}
          placeholder="Ask how to do something…"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              if (canSend) send(draft);
            }
          }}
          className="max-h-32 min-h-8 flex-1 resize-none bg-transparent py-1.5 text-base outline-none placeholder:text-muted-foreground md:text-sm"
        />
        {busy ? (
          <Button type="button" size="icon" variant="outline" className="size-8 shrink-0 rounded-full" onClick={stop} aria-label="Stop the answer" title="Stop">
            <Square className="size-3.5 fill-current" />
          </Button>
        ) : (
          <Button
            type="submit"
            size="icon"
            className="size-8 shrink-0 rounded-full bg-brand text-brand-foreground hover:bg-brand-dark"
            disabled={!canSend}
            aria-label="Send question"
            title="Send (Enter)"
          >
            <ArrowUp className="size-4" />
          </Button>
        )}
      </div>
      <p className="mt-2 text-center text-[11px] leading-snug text-muted-foreground">
        AI answers can be wrong – check important steps. Don&apos;t share personal details.
      </p>
    </form>
  );
}

function NotConfigured() {
  const { setOpen } = useAssistant();
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 overflow-y-auto px-6 py-8 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300" aria-hidden>
        <KeyRound className="size-6" />
      </span>
      <h2 className="text-base font-semibold">The assistant isn&apos;t set up yet</h2>
      <p className="text-sm text-muted-foreground">
        Add your OpenRouter API key to the server settings as <code className="rounded bg-muted px-1 py-0.5 text-xs">{ASSISTANT_KEY_ENV}</code>, then restart or
        redeploy the app.
      </p>
      <p className="text-xs text-muted-foreground">Only people who can change system settings see this. The button stays hidden for everyone else until the key is added.</p>
      <Button asChild className="mt-1">
        <Link href="/configuration/assistant" onClick={() => setOpen(false)}>
          Open AI assistant settings
        </Link>
      </Button>
    </div>
  );
}
