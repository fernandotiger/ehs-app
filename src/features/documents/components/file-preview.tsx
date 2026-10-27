"use client";

import { Download, ExternalLink } from "lucide-react";
import { useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatBytes } from "@/lib/upload-client";
import type { VersionSummaryDto } from "@/server/modules/documents/document.dto";
import { documentFileUrl } from "../api";
import { isInlinePreviewable } from "../format";
import { FileTypeIcon } from "./file-type-icon";

const DESKTOP_QUERY = "(min-width: 768px)";

/**
 * Desktop detection that is `false` on the server and during hydration, so the PDF iframe
 * is never mounted (and the file never fetched) on phones – fetching counts as "opened".
 */
function useIsDesktop(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mql = window.matchMedia(DESKTOP_QUERY);
      mql.addEventListener("change", cb);
      return () => mql.removeEventListener("change", cb);
    },
    () => window.matchMedia(DESKTOP_QUERY).matches,
    () => false,
  );
}

/**
 * Inline preview (PDF / image / text) plus Open and Download actions. Loading the
 * preview, opening or downloading all go through the audited file route, so each counts
 * as "opened"; `onOpened` lets the parent refresh the acknowledgement state.
 */
export function FilePreview({ documentId, version, onOpened }: { documentId: string; version: VersionSummaryDto; onOpened: () => void }) {
  const kind = isInlinePreviewable(version.mimeType);
  const isDesktop = useIsDesktop();
  const inlineUrl = documentFileUrl(documentId, version.id);
  const downloadUrl = documentFileUrl(documentId, version.id, true);
  const [loaded, setLoaded] = useState(false);
  const showFrame = isDesktop && (kind === "pdf" || kind === "text");

  const actions = (
    <div className="flex w-full flex-wrap gap-2 sm:w-auto">
      <Button asChild size="lg" className="flex-1 sm:flex-none">
        <a href={inlineUrl} target="_blank" rel="noopener" onClick={onOpened}>
          <ExternalLink /> Open
        </a>
      </Button>
      <Button asChild variant="outline" size="lg" className="flex-1 sm:flex-none">
        <a href={downloadUrl} download={version.fileName} onClick={onOpened}>
          <Download /> Download
        </a>
      </Button>
    </div>
  );

  return (
    <Card className="gap-0 overflow-hidden py-0">
      <div className="flex flex-col gap-3 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <FileTypeIcon mimeType={version.mimeType} className="size-9" />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{version.fileName}</p>
            <p className="text-xs text-muted-foreground">
              Version {version.versionNumber} · {formatBytes(version.sizeBytes)}
            </p>
          </div>
        </div>
        {actions}
      </div>

      {showFrame ? (
        <div className="relative bg-muted/40">
          {!loaded && <Skeleton className="absolute inset-4 rounded-lg" />}
          <iframe
            src={inlineUrl}
            title={version.fileName}
            className="relative h-[75vh] min-h-[480px] w-full"
            onLoad={() => {
              setLoaded(true);
              onOpened();
            }}
          />
        </div>
      ) : kind === "image" ? (
        <div className="flex justify-center bg-muted/40 p-4">
          {/* eslint-disable-next-line @next/next/no-img-element -- authorised API stream, not a static asset */}
          <img src={inlineUrl} alt={version.fileName} className="max-h-[75vh] w-auto rounded-lg object-contain" onLoad={onOpened} />
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
          <FileTypeIcon mimeType={version.mimeType} className="size-16 rounded-2xl [&_svg]:size-8" />
          <p className="max-w-sm text-sm text-muted-foreground">
            {kind ? "Tap Open to read the document." : "This file type can't be previewed in the browser. Download it to read it."}
          </p>
        </div>
      )}
    </Card>
  );
}
