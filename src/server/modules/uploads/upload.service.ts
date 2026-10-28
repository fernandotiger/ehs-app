import "server-only";
import { createHash } from "node:crypto";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { FIXED_UPLOAD_LIMITS, UPLOAD_FOLDERS, type InitUploadInput, type UploadPurpose } from "@/lib/validation/uploads";
import type { CurrentUser } from "@/server/auth/current-user";
import { prisma, type DbClient } from "@/server/db/client";
import { BusinessRuleError, ForbiddenError, NotFoundError, ValidationError } from "@/server/http/errors";
import { settingsService } from "@/server/modules/settings/settings.service";
import { getStorage } from "@/server/storage";

const SESSION_TTL_MS = 60 * 60 * 1000;
/** Files the server generates (e.g. a risk assessment PDF) wait this long for the form that uses them. */
const GENERATED_TTL_MS = 24 * 60 * 60 * 1000;

export interface ConsumedFile {
  storageDriver: string;
  storageKey: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  checksum: string | null;
}

function sanitiseFileName(name: string): string {
  const cleaned = name.normalize("NFKD").replace(/[^\w.\- ]+/g, "").replace(/\s+/g, "-").slice(-120);
  return cleaned || "file";
}

function formatMb(bytes: number) {
  return `${Math.round((bytes / 1024 / 1024) * 10) / 10} MB`;
}

async function limitFor(purpose: UploadPurpose): Promise<number> {
  return FIXED_UPLOAD_LIMITS[purpose] ?? (await settingsService.maxUploadBytes(purpose === "evidence" ? "evidence" : "default"));
}

/** Every object lives below its tenant's prefix, so storage can be audited/exported per company. */
function storageKeyFor(organizationId: string, purpose: UploadPurpose, now: Date, uploadId: string, fileName: string): string {
  return `org/${organizationId}/${UPLOAD_FOLDERS[purpose]}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${uploadId}/${sanitiseFileName(fileName)}`;
}

export interface CreateFromBytesInput {
  purpose: UploadPurpose;
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
}

export interface UploadSummary {
  uploadId: string;
  purpose: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}

async function loadOwnedSession(uploadId: string, user: Pick<CurrentUser, "id">) {
  const session = await prisma.uploadSession.findUnique({ where: { id: uploadId } });
  if (!session) throw new NotFoundError("Upload not found");
  if (session.userId !== user.id) throw new ForbiddenError();
  return session;
}

/**
 * Two-phase uploads:
 *  1. `init` validates size against the configurable limit and reserves a storage key.
 *  2. The browser sends the bytes (directly to storage where supported).
 *  3. `complete` verifies what actually landed in storage.
 *  4. A domain operation calls `consume` inside its transaction to attach the file.
 */
export const uploadService = {
  async init(input: InitUploadInput, user: CurrentUser) {
    const maxBytes = await limitFor(input.purpose);
    if (input.purpose !== "document-version" && input.sizeBytes === 0) throw new ValidationError("The file is empty.");
    if (input.sizeBytes > maxBytes) {
      throw new ValidationError(`File is too large. The maximum size is ${formatMb(maxBytes)}.`);
    }
    const storage = getStorage();
    const now = new Date();

    const session = await prisma.uploadSession.create({
      data: {
        organizationId: user.organizationId,
        userId: user.id,
        purpose: input.purpose,
        storageDriver: storage.driver,
        // Temporary unique key; replaced below once we know the id.
        storageKey: `pending/${crypto.randomUUID()}`,
        fileName: input.fileName,
        mimeType: input.mimeType || "application/octet-stream",
        maxBytes,
        expiresAt: new Date(now.getTime() + SESSION_TTL_MS),
      },
    });

    const storageKey = storageKeyFor(user.organizationId, input.purpose, now, session.id, input.fileName);
    await prisma.uploadSession.update({ where: { id: session.id }, data: { storageKey } });

    const instruction = await storage.createUploadInstruction({
      uploadId: session.id,
      key: storageKey,
      contentType: session.mimeType,
      maxBytes,
    });

    return { uploadId: session.id, maxBytes, instruction };
  },

  /** Receives bytes for drivers that upload through our API (local driver). */
  async receiveContent(uploadId: string, user: CurrentUser, body: ReadableStream<Uint8Array> | null) {
    const session = await loadOwnedSession(uploadId, user);
    if (session.status !== "PENDING") throw new BusinessRuleError("Upload already received");
    if (session.expiresAt < new Date()) throw new BusinessRuleError("Upload session expired");
    if (!body) throw new ValidationError("Empty upload");

    const hash = createHash("sha256");
    const chunks: Uint8Array[] = [];
    let size = 0;
    const reader = body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > session.maxBytes) {
        await reader.cancel();
        throw new ValidationError(`File is too large. The maximum size is ${formatMb(session.maxBytes)}.`);
      }
      hash.update(value);
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const c of chunks) {
      bytes.set(c, offset);
      offset += c.byteLength;
    }

    await getStorage(session.storageDriver).put(session.storageKey, bytes, session.mimeType);
    await prisma.uploadSession.update({
      where: { id: session.id },
      data: { status: "UPLOADED", sizeBytes: size, checksum: hash.digest("hex") },
    });
    return { uploadId: session.id, sizeBytes: size };
  },

  /** Issues a Vercel Blob client token restricted to this session's key and size. */
  async handleBlobToken(uploadId: string, user: CurrentUser, request: Request, body: HandleUploadBody) {
    const session = await loadOwnedSession(uploadId, user);
    return handleUpload({
      request,
      body,
      onBeforeGenerateToken: async (pathname) => {
        if (pathname !== session.storageKey) throw new ForbiddenError("Pathname does not match upload session");
        if (session.status !== "PENDING" || session.expiresAt < new Date()) {
          throw new BusinessRuleError("Upload session is no longer valid");
        }
        return {
          maximumSizeInBytes: session.maxBytes,
          addRandomSuffix: false,
          allowOverwrite: false,
          validUntil: session.expiresAt.getTime(),
        };
      },
    });
  },

  /** Verifies the object in storage and marks the session as uploaded. Idempotent. */
  async complete(uploadId: string, user: CurrentUser) {
    const session = await loadOwnedSession(uploadId, user);
    if (session.status === "UPLOADED" || session.status === "CONSUMED") {
      return { uploadId, sizeBytes: session.sizeBytes ?? 0 };
    }
    const storage = getStorage(session.storageDriver);
    const info = await storage.head(session.storageKey);
    if (!info) throw new BusinessRuleError("The file has not been uploaded yet");
    if (info.sizeBytes > session.maxBytes) {
      await storage.delete(session.storageKey);
      throw new ValidationError(`File is too large. The maximum size is ${formatMb(session.maxBytes)}.`);
    }
    await prisma.uploadSession.update({
      where: { id: session.id },
      data: { status: "UPLOADED", sizeBytes: info.sizeBytes },
    });
    return { uploadId, sizeBytes: info.sizeBytes };
  },

  /**
   * Server-generated files (e.g. a risk assessment PDF): creates the session for `user`, stores the
   * bytes under the same `org/<organizationId>/<folder>/…` key scheme and marks it UPLOADED with
   * size + sha256, so a domain operation later consumes it exactly like a browser upload.
   * `onUploaded` runs in the transaction that marks it uploaded (e.g. the caller's audit record).
   */
  async createFromBytes(
    user: Pick<CurrentUser, "id" | "organizationId">,
    input: CreateFromBytesInput,
    onUploaded?: (tx: DbClient, upload: UploadSummary) => Promise<void>,
  ): Promise<UploadSummary> {
    const sizeBytes = input.bytes.byteLength;
    if (sizeBytes === 0) throw new ValidationError("The file is empty.");
    const maxBytes = await limitFor(input.purpose);
    if (sizeBytes > maxBytes) throw new ValidationError(`File is too large. The maximum size is ${formatMb(maxBytes)}.`);
    const storage = getStorage();
    const now = new Date();
    const mimeType = input.mimeType || "application/octet-stream";

    const session = await prisma.uploadSession.create({
      data: {
        organizationId: user.organizationId,
        userId: user.id,
        purpose: input.purpose,
        storageDriver: storage.driver,
        storageKey: `pending/${crypto.randomUUID()}`,
        fileName: input.fileName,
        mimeType,
        maxBytes,
        expiresAt: new Date(now.getTime() + GENERATED_TTL_MS),
      },
    });
    const storageKey = storageKeyFor(user.organizationId, input.purpose, now, session.id, input.fileName);
    await storage.put(storageKey, input.bytes, mimeType);
    const checksum = createHash("sha256").update(input.bytes).digest("hex");
    const upload: UploadSummary = { uploadId: session.id, purpose: input.purpose, fileName: input.fileName, mimeType, sizeBytes };
    try {
      await prisma.$transaction(async (tx) => {
        await tx.uploadSession.update({ where: { id: session.id }, data: { storageKey, status: "UPLOADED", sizeBytes, checksum } });
        await onUploaded?.(tx, upload);
      });
    } catch (error) {
      await storage.delete(storageKey).catch(() => undefined);
      throw error;
    }
    return upload;
  },

  /**
   * The owner's own uploaded, not yet used file (name, type, size – never the storage key).
   * Used, expired, still pending or someone else's → 404.
   */
  async summary(uploadId: string, user: Pick<CurrentUser, "id">): Promise<UploadSummary> {
    const session = await prisma.uploadSession.findUnique({ where: { id: uploadId } });
    if (!session || session.userId !== user.id || session.status !== "UPLOADED" || session.expiresAt < new Date()) {
      throw new NotFoundError("This file is no longer available – choose the file again.");
    }
    return { uploadId: session.id, purpose: session.purpose, fileName: session.fileName, mimeType: session.mimeType, sizeBytes: session.sizeBytes ?? 0 };
  },

  /**
   * Claims an uploaded file for a domain record. Must be called inside the domain
   * transaction so a failed operation leaves the upload unconsumed.
   */
  /**
   * `forget`: delete the upload session once used, so nothing links the uploader to the file
   * (files added with an anonymous incident report).
   */
  async consume(uploadId: string, user: Pick<CurrentUser, "id">, purpose: UploadPurpose, db: DbClient, options: { forget?: boolean } = {}): Promise<ConsumedFile> {
    const session = await db.uploadSession.findUnique({ where: { id: uploadId } });
    if (!session || session.userId !== user.id) throw new ValidationError("Invalid upload reference");
    if (session.purpose !== purpose) throw new ValidationError("Upload was created for a different purpose");
    if (session.status !== "UPLOADED") throw new ValidationError("Upload is not complete or was already used");

    const claimed = await db.uploadSession.updateMany({
      where: { id: uploadId, status: "UPLOADED" },
      data: { status: "CONSUMED" },
    });
    if (claimed.count !== 1) throw new ValidationError("Upload was already used");
    if (options.forget) await db.uploadSession.delete({ where: { id: uploadId } });

    return {
      storageDriver: session.storageDriver,
      storageKey: session.storageKey,
      fileName: session.fileName,
      mimeType: session.mimeType,
      sizeBytes: session.sizeBytes ?? 0,
      checksum: session.checksum,
    };
  },
};
