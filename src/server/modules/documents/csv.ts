import { AsyncResource } from "node:async_hooks";

/** Minimal RFC 4180 CSV helpers (pure). */

export type CsvValue = string | number | boolean | Date | null | undefined;

/**
 * Escapes one cell. Values that spreadsheet apps would treat as formulas (=, +, -, @, tab, CR)
 * are prefixed with an apostrophe to prevent CSV injection.
 */
export function csvCell(value: CsvValue): string {
  if (value === null || value === undefined) return "";
  let text = value instanceof Date ? value.toISOString() : typeof value === "boolean" ? (value ? "Yes" : "No") : String(value);
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function csvRow(values: CsvValue[]): string {
  return `${values.map(csvCell).join(",")}\r\n`;
}

export function csvFileName(title: string, suffix: string, now: Date): string {
  const slug = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${slug || "document"}-${suffix}-${now.toISOString().slice(0, 10)}.csv`;
}

/**
 * Builds a streaming CSV response from an async page producer, so large exports never
 * hold every row in memory. `nextPage` returns rendered rows, or null when finished.
 */
export function csvStreamResponse(fileName: string, header: string, nextPage: () => Promise<string | null>): Response {
  // The stream is pulled after the route handler has returned, i.e. outside the request's async
  // context – bind the producer to it so tenant-scoped queries still see the tenant.
  const next = AsyncResource.bind(nextPage);
  const encoder = new TextEncoder();
  let started = false;
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        if (!started) {
          started = true;
          // UTF-8 BOM so Excel detects the encoding.
          controller.enqueue(encoder.encode(`﻿${header}`));
          return;
        }
        const chunk = await next();
        if (chunk === null) controller.close();
        else controller.enqueue(encoder.encode(chunk));
      } catch (error) {
        controller.error(error);
      }
    },
  });
  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
