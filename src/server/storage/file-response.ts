import "server-only";
import { NotFoundError } from "@/server/http/errors";
import { getStorage } from "./index";

/** Types that are safe to render inline in the browser. Everything else is forced to download. */
const INLINE_SAFE = [/^application\/pdf$/, /^image\/(png|jpe?g|gif|webp|bmp)$/, /^text\/plain$/, /^video\/(mp4|webm)$/, /^audio\//];

export interface FileRecord {
  storageDriver: string;
  storageKey: string;
  fileName: string;
  mimeType: string;
  sizeBytes?: number | null;
}

/**
 * Streams a stored file to the client. Callers MUST perform authorisation first –
 * this is the only way files leave storage, so storage URLs are never exposed.
 */
export async function streamFile(file: FileRecord, options: { inline?: boolean } = {}): Promise<Response> {
  const object = await getStorage(file.storageDriver).get(file.storageKey);
  if (!object) throw new NotFoundError("File not found in storage");

  const contentType = file.mimeType || object.contentType || "application/octet-stream";
  const inline = options.inline === true && INLINE_SAFE.some((re) => re.test(contentType));
  const asciiName = file.fileName.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "'");
  const disposition = `${inline ? "inline" : "attachment"}; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(file.fileName)}`;

  const headers = new Headers({
    "Content-Type": contentType,
    "Content-Disposition": disposition,
    "Cache-Control": "private, no-cache",
    "X-Content-Type-Options": "nosniff",
  });
  // Non-inline responses can be sandboxed; Chrome's PDF viewer refuses to render under a sandbox CSP.
  if (!inline) headers.set("Content-Security-Policy", "sandbox");
  const size = object.sizeBytes ?? file.sizeBytes;
  if (size) headers.set("Content-Length", String(size));

  return new Response(object.body, { status: 200, headers });
}
