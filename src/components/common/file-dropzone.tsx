"use client";

import { FileUp, Paperclip, X } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useSystemSettings } from "@/features/shared/settings";
import { formatBytes } from "@/lib/upload-client";
import { cn } from "@/lib/utils";

/**
 * Drag-and-drop file selector. Accepts any file type; enforces the configurable
 * maximum upload size (System Settings) on the client for fast feedback – the server
 * enforces it again.
 */
export function FileDropzone({
  files,
  onChange,
  multiple = false,
  progress,
  disabled,
  id,
  hint,
  maxBytes: maxBytesOverride,
  accept: acceptTypes,
}: {
  files: File[];
  onChange: (files: File[]) => void;
  multiple?: boolean;
  /** Optional per-file upload progress (0-100) keyed by file name. */
  progress?: Record<string, number>;
  disabled?: boolean;
  id?: string;
  hint?: string;
  /** Override the limit (e.g. evidence uses System settings → evidence upload limit). */
  maxBytes?: number;
  /** File picker filter, e.g. ".csv" or "image/png,image/jpeg,image/svg+xml". */
  accept?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { data: settings } = useSystemSettings();
  const maxBytes = maxBytesOverride ?? (settings?.maxUploadSizeMb ?? 10) * 1024 * 1024;

  function accept(list: FileList | null) {
    if (!list?.length) return;
    const incoming = Array.from(list);
    const tooLarge = incoming.filter((f) => f.size > maxBytes);
    const ok = incoming.filter((f) => f.size <= maxBytes);
    setError(tooLarge.length ? `${tooLarge.map((f) => f.name).join(", ")} exceed${tooLarge.length === 1 ? "s" : ""} the ${formatBytes(maxBytes)} limit.` : null);
    if (!ok.length) return;
    onChange(multiple ? [...files, ...ok] : [ok[0]!]);
  }

  return (
    <div className="space-y-2">
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled}
        onClick={() => !disabled && inputRef.current?.click()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && !disabled && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (!disabled) accept(e.dataTransfer.files);
        }}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors",
          dragging ? "border-brand bg-brand-soft/60" : "border-input hover:border-brand-light hover:bg-muted/40",
          disabled && "cursor-not-allowed opacity-60",
        )}
      >
        <span className="flex size-10 items-center justify-center rounded-full bg-brand-soft text-brand">
          <FileUp className="size-5" />
        </span>
        <p className="text-sm font-medium">
          Drop {multiple ? "files" : "a file"} here or <span className="text-brand underline">browse</span>
        </p>
        <p className="text-xs text-muted-foreground">{hint ?? `Any file type · up to ${formatBytes(maxBytes)}`}</p>
        <input
          ref={inputRef}
          id={id}
          type="file"
          className="hidden"
          multiple={multiple}
          accept={acceptTypes}
          disabled={disabled}
          onChange={(e) => {
            accept(e.target.files);
            e.target.value = "";
          }}
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {files.length > 0 && (
        <ul className="space-y-1.5">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} className="rounded-lg border bg-card px-3 py-2">
              <div className="flex items-center gap-2">
                <Paperclip className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate text-sm">{f.name}</span>
                <span className="text-xs text-muted-foreground">{formatBytes(f.size)}</span>
                {!disabled && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    aria-label={`Remove ${f.name}`}
                    onClick={() => onChange(files.filter((_, j) => j !== i))}
                  >
                    <X className="size-3.5" />
                  </Button>
                )}
              </div>
              {progress?.[f.name] !== undefined && <Progress value={progress[f.name]} className="mt-2 h-1.5" />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
