"use client";

import { upload as blobUpload } from "@vercel/blob/client";
import { api, ApiError } from "@/lib/api-client";
import type { UploadPurpose } from "@/lib/validation/uploads";

type UploadInstruction =
  | { mode: "server"; url: string; method: "PUT" }
  | { mode: "vercel-blob"; pathname: string; handleUploadUrl: string }
  | { mode: "presigned"; url: string; method: "PUT"; headers: Record<string, string> };

export interface UploadResult {
  uploadId: string;
  fileName: string;
  sizeBytes: number;
}

function xhrPut(url: string, file: Blob, headers: Record<string, string>, onProgress?: (pct: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    Object.entries(headers).forEach(([k, v]) => xhr.setRequestHeader(k, v));
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve();
      let message = `Upload failed (${xhr.status})`;
      try {
        message = JSON.parse(xhr.responseText)?.error?.message ?? message;
      } catch {}
      reject(new ApiError(message, xhr.status, "UPLOAD_FAILED"));
    };
    xhr.onerror = () => reject(new ApiError("Network error during upload", 0, "NETWORK_ERROR"));
    xhr.send(file);
  });
}

/**
 * Uploads a file using whichever strategy the server's storage driver requires.
 * Returns an uploadId that is then passed to the domain API (e.g. create document).
 */
export async function uploadFile(
  file: File | Blob,
  purpose: UploadPurpose,
  options: { fileName?: string; onProgress?: (pct: number) => void } = {},
): Promise<UploadResult> {
  const fileName = options.fileName ?? (file instanceof File ? file.name : "file");
  const mimeType = file.type || "application/octet-stream";

  const { uploadId, instruction } = await api.post<{ uploadId: string; maxBytes: number; instruction: UploadInstruction }>(
    "/api/uploads",
    { purpose, fileName, mimeType, sizeBytes: file.size },
  );

  switch (instruction.mode) {
    case "server":
      await xhrPut(instruction.url, file, { "Content-Type": mimeType }, options.onProgress);
      break;
    case "presigned":
      await xhrPut(instruction.url, file, instruction.headers, options.onProgress);
      break;
    case "vercel-blob":
      await blobUpload(instruction.pathname, file, {
        access: "private",
        handleUploadUrl: instruction.handleUploadUrl,
        contentType: mimeType,
        onUploadProgress: (e) => options.onProgress?.(Math.round(e.percentage)),
      });
      break;
  }

  const { sizeBytes } = await api.post<{ uploadId: string; sizeBytes: number }>(`/api/uploads/${uploadId}/complete`);
  return { uploadId, fileName, sizeBytes };
}

/** A file already uploaded for the signed-in user and not used yet (e.g. a PDF prepared by the server). */
export interface UploadSummary {
  uploadId: string;
  purpose: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}

/** Name, type and size of the caller's own unused upload; 404 when it was used, expired or is not theirs. */
export function getUploadSummary(uploadId: string): Promise<UploadSummary> {
  return api.get<UploadSummary>(`/api/uploads/${encodeURIComponent(uploadId)}`);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
