"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ConfirmDialog } from "@/components/common/confirm-dialog";

/**
 * Warns before unsaved changes are lost:
 *  - closing/reloading the tab (browser `beforeunload` prompt);
 *  - clicking an in-app link (sidebar, breadcrumbs, back links) – shows a confirm dialog;
 *  - any in-page action wrapped with `confirm(action)` (e.g. switching the edited record).
 *
 *   const guard = useUnsavedChangesGuard(form.formState.isDirty);
 *   …
 *   return <>{guard.dialog}…</>;
 */
export function useUnsavedChangesGuard(dirty: boolean, message = "Your changes have not been saved. Leave and discard them?") {
  const router = useRouter();
  const [pending, setPending] = useState<(() => void) | null>(null);

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  useEffect(() => {
    if (!dirty) return;
    // Capture phase on document runs before React's (root) handlers, so Next <Link> never navigates.
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor || (anchor.target && anchor.target !== "_self") || anchor.hasAttribute("download")) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      event.preventDefault();
      event.stopPropagation();
      setPending(() => () => router.push(url.pathname + url.search + url.hash));
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [dirty, router]);

  /** Runs `action` immediately, or after the user confirms discarding their changes. */
  const confirm = useCallback(
    (action: () => void) => {
      if (dirty) setPending(() => action);
      else action();
    },
    [dirty],
  );

  const dialog = (
    <ConfirmDialog
      open={pending !== null}
      onOpenChange={(open) => {
        if (!open) setPending(null);
      }}
      title="Discard unsaved changes?"
      description={message}
      confirmLabel="Discard changes"
      destructive
      onConfirm={() => {
        const action = pending;
        setPending(null);
        action?.();
      }}
    />
  );

  return { confirm, dialog };
}
