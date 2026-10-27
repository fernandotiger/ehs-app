import "server-only";
import { del, get, head, put } from "@vercel/blob";
import type { CreateUploadInput, StorageProvider, StoredObject, StoredObjectInfo, UploadInstruction } from "./types";

/**
 * Vercel Blob storage using PRIVATE blobs – objects are never publicly reachable.
 * Downloads are always streamed through our authorised API routes.
 *
 * Uploads go straight from the browser to Vercel Blob (client uploads) so files up to the
 * configured limit bypass the ~4.5 MB serverless request body limit.
 */
export class VercelBlobStorageProvider implements StorageProvider {
  readonly driver = "vercel-blob" as const;

  constructor(private readonly token?: string) {}

  async put(key: string, body: Uint8Array | ReadableStream<Uint8Array>, contentType: string): Promise<StoredObjectInfo> {
    const payload = body instanceof Uint8Array ? Buffer.from(body) : body;
    const result = await put(key, payload, {
      access: "private",
      contentType,
      addRandomSuffix: false,
      token: this.token,
    });
    const info = await this.head(result.pathname);
    return { key: result.pathname, sizeBytes: info?.sizeBytes ?? 0, contentType };
  }

  async get(key: string): Promise<StoredObject | null> {
    const result = await get(key, { access: "private", token: this.token });
    if (!result || result.statusCode !== 200) return null;
    return { body: result.stream, sizeBytes: result.blob.size, contentType: result.blob.contentType };
  }

  async head(key: string): Promise<StoredObjectInfo | null> {
    try {
      const result = await head(key, { token: this.token });
      return { key: result.pathname, sizeBytes: result.size, contentType: result.contentType };
    } catch {
      return null;
    }
  }

  async delete(key: string): Promise<void> {
    await del(key, { token: this.token });
  }

  async createUploadInstruction(input: CreateUploadInput): Promise<UploadInstruction> {
    return { mode: "vercel-blob", pathname: input.key, handleUploadUrl: `/api/uploads/${input.uploadId}/blob-token` };
  }
}
