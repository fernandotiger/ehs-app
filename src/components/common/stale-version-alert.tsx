"use client";

import { Download, RefreshCw } from "lucide-react";
import { useState } from "react";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api-client";

/** True for a 409 caused by an optimistic-concurrency check (someone else saved first). */
export function isStaleVersion(error: unknown): boolean {
  return error instanceof ApiError && error.code === "STALE_VERSION";
}

/**
 * Shown after a save was rejected because someone else saved first. The user's draft stays in
 * the form; they can download it, or explicitly discard it and reload the saved version.
 */
export function StaleVersionAlert({
  draft,
  draftName = "draft",
  onReload,
  className,
}: {
  /** The unsaved values (downloaded as JSON for recovery). */
  draft: unknown;
  draftName?: string;
  /** Discard the draft and load the saved version. */
  onReload: () => void;
  className?: string;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  function download() {
    const blob = new Blob([JSON.stringify(draft, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${draftName}-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Alert variant="destructive" className={className} role="alert">
      <AlertTitle>Changed by someone else – reload to see their changes</AlertTitle>
      <AlertDescription>
        <p>Your changes were not saved and are still on this screen. Download them if you want to keep a copy, then reload the saved version.</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" onClick={download}>
            <Download /> Download my draft
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => setConfirmOpen(true)}>
            <RefreshCw /> Reload saved version
          </Button>
        </div>
      </AlertDescription>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Discard your changes and reload?"
        description="Your unsaved changes on this screen will be replaced by the version someone else saved."
        confirmLabel="Discard and reload"
        destructive
        onConfirm={onReload}
      />
    </Alert>
  );
}
