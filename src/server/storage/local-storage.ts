import "server-only";
import { createReadStream } from "node:fs";
import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import type { CreateUploadInput, StorageProvider, StoredObject, StoredObjectInfo, UploadInstruction } from "./types";

/**
 * Stores files on the local file system. Intended for local development and testing
 * (serverless platforms such as Vercel have no persistent disk).
 */
export class LocalStorageProvider implements StorageProvider {
  readonly driver = "local" as const;
  private readonly root: string;

  constructor(rootDir: string) {
    // The root is chosen at runtime; without the ignore hint Turbopack traces the whole project into every function.
    this.root = path.resolve(/*turbopackIgnore: true*/ process.cwd(), rootDir);
  }

  /** Resolve a key to an absolute path, refusing anything that escapes the root. */
  private resolve(key: string): string {
    const target = path.resolve(this.root, key);
    if (!target.startsWith(this.root + path.sep)) {
      throw new Error("Invalid storage key");
    }
    return target;
  }

  async put(key: string, body: Uint8Array | ReadableStream<Uint8Array>, contentType: string): Promise<StoredObjectInfo> {
    const target = this.resolve(key);
    await mkdir(path.dirname(target), { recursive: true });
    const bytes = body instanceof Uint8Array ? body : new Uint8Array(await new Response(body).arrayBuffer());
    await writeFile(target, bytes);
    return { key, sizeBytes: bytes.byteLength, contentType };
  }

  async get(key: string): Promise<StoredObject | null> {
    const info = await this.head(key);
    if (!info) return null;
    const nodeStream = createReadStream(this.resolve(key));
    return { body: Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>, sizeBytes: info.sizeBytes };
  }

  async head(key: string): Promise<StoredObjectInfo | null> {
    try {
      const s = await stat(this.resolve(key));
      return s.isFile() ? { key, sizeBytes: s.size } : null;
    } catch {
      return null;
    }
  }

  async delete(key: string): Promise<void> {
    await rm(this.resolve(key), { force: true });
  }

  async createUploadInstruction(input: CreateUploadInput): Promise<UploadInstruction> {
    return { mode: "server", url: `/api/uploads/${input.uploadId}/content`, method: "PUT" };
  }
}
