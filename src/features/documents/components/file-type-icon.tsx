import { File, FileImage, FileSpreadsheet, FileText, FileVideo, Presentation } from "lucide-react";
import { cn } from "@/lib/utils";

type IconKind = "image" | "video" | "sheet" | "slides" | "text" | "file";

function kindOf(mimeType: string | undefined): IconKind {
  if (!mimeType) return "text";
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (/spreadsheet|excel|csv/.test(mimeType)) return "sheet";
  if (/presentation|powerpoint/.test(mimeType)) return "slides";
  if (/pdf|word|document|text/.test(mimeType)) return "text";
  return "file";
}

function Glyph({ kind }: { kind: IconKind }) {
  const cls = "size-5";
  switch (kind) {
    case "image":
      return <FileImage className={cls} />;
    case "video":
      return <FileVideo className={cls} />;
    case "sheet":
      return <FileSpreadsheet className={cls} />;
    case "slides":
      return <Presentation className={cls} />;
    case "text":
      return <FileText className={cls} />;
    default:
      return <File className={cls} />;
  }
}

/** Rounded document tile used in lists and file cards. */
export function FileTypeIcon({ mimeType, className }: { mimeType?: string; className?: string }) {
  return (
    <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand", className)}>
      <Glyph kind={kindOf(mimeType)} />
    </span>
  );
}
