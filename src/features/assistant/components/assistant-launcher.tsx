"use client";

import { Sparkles, X } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { useEffect, useRef } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useSidebar } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { useAssistantStatus } from "../api";
import { AssistantPanel } from "./assistant-panel";
import { useAssistant } from "./assistant-provider";

/**
 * The ✦ button bottom-right on every signed-in page and its chat pop-up. Shown when the assistant
 * is ready; when no OpenRouter key is set only people who can configure it see it (with set-up
 * help). Desktop: a non-modal pop-up above the button, so people can follow the steps on the
 * page while it stays open. Phones: a full-screen modal sheet; the button sits above the bottom bar.
 */
export function AssistantLauncher() {
  const status = useAssistantStatus();
  const { open, setOpen } = useAssistant();
  const { isMobile } = useSidebar();
  const contentRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const data = status.data;
  const visible = Boolean(data && (data.state === "ready" || (data.state === "not-configured" && data.canConfigure)));

  // While the button is shown, bottom action bars leave room for it (the `assistant:` variant in globals.css).
  useEffect(() => {
    if (!visible) return;
    const root = document.documentElement;
    root.dataset.assistant = "";
    return () => {
      delete root.dataset.assistant;
    };
  }, [visible]);

  if (!data || !visible) return null;
  const ready = data.state === "ready";
  const label = open ? `Close ${data.name}` : ready ? `Ask ${data.name}` : `${data.name} – not set up yet`;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen} modal={isMobile}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DialogPrimitive.Trigger asChild>
            <button
              type="button"
              aria-label={label}
              data-print-hide
              className={cn(
                "fixed right-3 bottom-[calc(4rem+env(safe-area-inset-bottom)+0.75rem)] z-40 grid size-13 place-items-center rounded-full md:right-5 md:bottom-5",
                "bg-linear-to-br from-brand-light via-brand to-brand-dark text-brand-foreground shadow-lg shadow-brand/30 ring-1 ring-white/20",
                "transition-[transform,box-shadow] duration-200 ease-linear hover:scale-105 hover:shadow-xl active:scale-95 motion-reduce:transition-none",
                "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/40",
              )}
            >
              {open ? <X className="size-6" aria-hidden /> : <Sparkles className="size-6" aria-hidden />}
              {!ready && <span className="absolute right-0.5 top-0.5 size-3 rounded-full bg-amber-500 ring-2 ring-background" aria-hidden />}
            </button>
          </DialogPrimitive.Trigger>
        </TooltipTrigger>
        {!open && (
          <TooltipContent side="left" className="hidden md:block">
            {ready ? `Ask ${data.name}` : "AI assistant – not set up yet"}
          </TooltipContent>
        )}
      </Tooltip>

      <DialogPrimitive.Portal>
        {isMobile && (
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        )}
        <DialogPrimitive.Content
          ref={contentRef}
          onOpenAutoFocus={(e) => {
            if (!inputRef.current) return;
            e.preventDefault();
            inputRef.current.focus();
          }}
          // Desktop: stays open while the person works on the page; Esc closes it when focus is inside.
          onInteractOutside={(e) => {
            if (!isMobile) e.preventDefault();
          }}
          onEscapeKeyDown={(e) => {
            if (!isMobile && !contentRef.current?.contains(document.activeElement)) e.preventDefault();
          }}
          className={cn(
            "fixed z-50 flex flex-col overflow-hidden bg-card text-card-foreground outline-none",
            "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-bottom-4 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-bottom-4 motion-reduce:animate-none",
            isMobile
              ? "inset-0 h-dvh w-full"
              : "right-5 bottom-22 h-[min(40rem,calc(100dvh-7rem))] w-[min(25rem,calc(100vw-2.5rem))] rounded-2xl border shadow-2xl shadow-black/20",
          )}
        >
          <AssistantPanel status={data} inputRef={inputRef} onNavigate={() => isMobile && setOpen(false)} />
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
