/**
 * Storage abstraction (Strategy pattern).
 *
 * Domain code never talks to Vercel Blob / S3 / the file system directly. It only
 * depends on this interface, so the backing store is a configuration choice.
 */

export type StorageDriverName = "local" | "vercel-blob" | "s3";

export interface StoredObjectInfo {
  key: string;
  sizeBytes: number;
  contentType?: string;
}

export interface StoredObject {
  body: ReadableStream<Uint8Array>;
  sizeBytes?: number;
  contentType?: string;
}

/**
 * How the browser should send the bytes for an upload session.
 *  - "server":      PUT the raw file to our own API (local driver).
 *  - "vercel-blob": use @vercel/blob/client `upload()` with the given handleUploadUrl.
 *  - "presigned":   PUT the raw file to a presigned URL (S3).
 */
export type UploadInstruction =
  | { mode: "server"; url: string; method: "PUT" }
  | { mode: "vercel-blob"; pathname: string; handleUploadUrl: string }
  | { mode: "presigned"; url: string; method: "PUT"; headers: Record<string, string> };

export interface CreateUploadInput {
  uploadId: string;
  key: string;
  contentType: string;
  maxBytes: number;
}

export interface StorageProvider {
  readonly driver: StorageDriverName;

  /** Store bytes from the server side. */
  put(key: string, body: Uint8Array | ReadableStream<Uint8Array>, contentType: string): Promise<StoredObjectInfo>;

  /** Stream an object. Returns null when it does not exist. */
  get(key: string): Promise<StoredObject | null>;

  /** Metadata for an object. Returns null when it does not exist. */
  head(key: string): Promise<StoredObjectInfo | null>;

  delete(key: string): Promise<void>;

  /** Instructions for the browser to upload a file for the given upload session. */
  createUploadInstruction(input: CreateUploadInput): Promise<UploadInstruction>;
}
