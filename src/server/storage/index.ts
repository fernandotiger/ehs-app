import "server-only";
import { env } from "@/server/config/env";
import { LocalStorageProvider } from "./local-storage";
import { S3StorageProvider } from "./s3-storage";
import type { StorageDriverName, StorageProvider } from "./types";
import { VercelBlobStorageProvider } from "./vercel-blob-storage";

export type { StorageProvider, StorageDriverName, UploadInstruction } from "./types";

const providers = new Map<StorageDriverName, StorageProvider>();

function build(driver: StorageDriverName): StorageProvider {
  const e = env();
  switch (driver) {
    case "vercel-blob":
      return new VercelBlobStorageProvider(e.BLOB_READ_WRITE_TOKEN);
    case "s3":
      return new S3StorageProvider({
        bucket: e.S3_BUCKET!,
        region: e.S3_REGION,
        endpoint: e.S3_ENDPOINT,
        accessKeyId: e.S3_ACCESS_KEY_ID,
        secretAccessKey: e.S3_SECRET_ACCESS_KEY,
      });
    case "local":
    default:
      return new LocalStorageProvider(e.LOCAL_STORAGE_DIR);
  }
}

/**
 * Returns the storage provider. Without an argument it returns the configured default
 * (STORAGE_DRIVER) for new uploads. Pass the `storageDriver` saved on a file record to
 * read files written by a previous driver (useful during a storage migration).
 */
export function getStorage(driver?: string): StorageProvider {
  const name = (driver ?? env().STORAGE_DRIVER) as StorageDriverName;
  let provider = providers.get(name);
  if (!provider) {
    provider = build(name);
    providers.set(name, provider);
  }
  return provider;
}
