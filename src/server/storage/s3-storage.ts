import "server-only";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { CreateUploadInput, StorageProvider, StoredObject, StoredObjectInfo, UploadInstruction } from "./types";

export interface S3StorageOptions {
  bucket: string;
  region?: string;
  endpoint?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
}

/**
 * AWS S3 (or S3-compatible) storage. The bucket should block all public access;
 * the browser uploads with short-lived presigned PUT URLs and downloads are streamed
 * through the authorised API.
 */
export class S3StorageProvider implements StorageProvider {
  readonly driver = "s3" as const;
  private readonly client: S3Client;

  constructor(private readonly options: S3StorageOptions) {
    this.client = new S3Client({
      region: options.region,
      endpoint: options.endpoint,
      forcePathStyle: Boolean(options.endpoint),
      credentials:
        options.accessKeyId && options.secretAccessKey
          ? { accessKeyId: options.accessKeyId, secretAccessKey: options.secretAccessKey }
          : undefined,
    });
  }

  async put(key: string, body: Uint8Array | ReadableStream<Uint8Array>, contentType: string): Promise<StoredObjectInfo> {
    const bytes = body instanceof Uint8Array ? body : new Uint8Array(await new Response(body).arrayBuffer());
    await this.client.send(
      new PutObjectCommand({ Bucket: this.options.bucket, Key: key, Body: bytes, ContentType: contentType }),
    );
    return { key, sizeBytes: bytes.byteLength, contentType };
  }

  async get(key: string): Promise<StoredObject | null> {
    try {
      const res = await this.client.send(new GetObjectCommand({ Bucket: this.options.bucket, Key: key }));
      if (!res.Body) return null;
      return {
        body: res.Body.transformToWebStream() as ReadableStream<Uint8Array>,
        sizeBytes: res.ContentLength,
        contentType: res.ContentType,
      };
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  async head(key: string): Promise<StoredObjectInfo | null> {
    try {
      const res = await this.client.send(new HeadObjectCommand({ Bucket: this.options.bucket, Key: key }));
      return { key, sizeBytes: res.ContentLength ?? 0, contentType: res.ContentType };
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.options.bucket, Key: key }));
  }

  async createUploadInstruction(input: CreateUploadInput): Promise<UploadInstruction> {
    const command = new PutObjectCommand({
      Bucket: this.options.bucket,
      Key: input.key,
      ContentType: input.contentType,
    });
    const url = await getSignedUrl(this.client, command, { expiresIn: 15 * 60 });
    return { mode: "presigned", url, method: "PUT", headers: { "Content-Type": input.contentType } };
  }
}

function isNotFound(error: unknown): boolean {
  const e = error as { name?: string; $metadata?: { httpStatusCode?: number } };
  return e?.name === "NotFound" || e?.name === "NoSuchKey" || e?.$metadata?.httpStatusCode === 404;
}
