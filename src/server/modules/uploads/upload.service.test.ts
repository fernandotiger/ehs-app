import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

// In-memory upload sessions + storage, so the server-side upload path runs without a database.
const { sessions, put, remove, uploadSession } = vi.hoisted(() => {
  const sessions = new Map<string, Record<string, unknown>>();
  const uploadSession = {
    create: async ({ data }: { data: Record<string, unknown> }) => {
      const row = { id: `up${sessions.size + 1}`, status: "PENDING", sizeBytes: null, checksum: null, ...data };
      sessions.set(row.id, row);
      return row;
    },
    update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const row = { ...sessions.get(where.id)!, ...data };
      sessions.set(where.id, row);
      return row;
    },
    findUnique: async ({ where }: { where: { id: string } }) => sessions.get(where.id) ?? null,
  };
  return { sessions, uploadSession, put: vi.fn(async (key: string) => ({ key, sizeBytes: 0 })), remove: vi.fn(async () => undefined) };
});

vi.mock("@vercel/blob/client", () => ({ handleUpload: vi.fn() }));
vi.mock("@/server/storage", () => ({ getStorage: () => ({ driver: "local", put, delete: remove }) }));
vi.mock("@/server/modules/settings/settings.service", () => ({ settingsService: { maxUploadBytes: vi.fn(async () => 1024) } }));
vi.mock("@/server/db/client", () => ({ prisma: { uploadSession, $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn({ uploadSession }) } }));

const { uploadService } = await import("./upload.service");

const user = { id: "u1", organizationId: "org1" };
const bytes = new TextEncoder().encode("%PDF-1.7 test");

beforeEach(() => {
  sessions.clear();
  put.mockClear();
  remove.mockClear();
});

describe("uploadService.createFromBytes", () => {
  it("stores the bytes under the tenant prefix and marks the session uploaded for the user", async () => {
    const onUploaded = vi.fn(async () => undefined);
    const result = await uploadService.createFromBytes(user, { purpose: "document-version", fileName: "RA-2026-0001 Forklift.pdf", mimeType: "application/pdf", bytes }, onUploaded);

    expect(result).toEqual({ uploadId: "up1", purpose: "document-version", fileName: "RA-2026-0001 Forklift.pdf", mimeType: "application/pdf", sizeBytes: bytes.byteLength });
    expect(result).not.toHaveProperty("storageKey");
    const row = sessions.get("up1")!;
    expect(row).toMatchObject({ userId: "u1", organizationId: "org1", status: "UPLOADED", sizeBytes: bytes.byteLength, checksum: createHash("sha256").update(bytes).digest("hex") });
    expect(row.storageKey).toMatch(/^org\/org1\/documents\/\d{4}\/\d{2}\/up1\/RA-2026-0001-Forklift\.pdf$/);
    expect(put).toHaveBeenCalledWith(row.storageKey, bytes, "application/pdf");
    expect(onUploaded).toHaveBeenCalledWith({ uploadSession }, result);
    expect((row.expiresAt as Date).getTime()).toBeGreaterThan(Date.now() + 60 * 60 * 1000);
  });

  it("respects the purpose's size limit and refuses empty files", async () => {
    await expect(uploadService.createFromBytes(user, { purpose: "document-version", fileName: "big.pdf", mimeType: "application/pdf", bytes: new Uint8Array(2048) })).rejects.toThrow(/too large/);
    await expect(uploadService.createFromBytes(user, { purpose: "document-version", fileName: "empty.pdf", mimeType: "application/pdf", bytes: new Uint8Array(0) })).rejects.toThrow(/empty/);
    expect(put).not.toHaveBeenCalled();
    expect(sessions.size).toBe(0);
  });

  it("removes the stored object when the follow-up (audit) fails", async () => {
    await expect(
      uploadService.createFromBytes(user, { purpose: "document-version", fileName: "a.pdf", mimeType: "application/pdf", bytes }, async () => {
        throw new Error("audit failed");
      }),
    ).rejects.toThrow("audit failed");
    expect(remove).toHaveBeenCalledWith(sessions.get("up1")!.storageKey);
  });
});

describe("uploadService.summary", () => {
  it("returns the owner's unused upload without the storage key", async () => {
    await uploadService.createFromBytes(user, { purpose: "document-version", fileName: "a.pdf", mimeType: "application/pdf", bytes });
    const summary = await uploadService.summary("up1", user);
    expect(summary).toEqual({ uploadId: "up1", purpose: "document-version", fileName: "a.pdf", mimeType: "application/pdf", sizeBytes: bytes.byteLength });
    expect(summary).not.toHaveProperty("storageKey");
  });

  it("404s for someone else's, used, expired or unknown uploads", async () => {
    await uploadService.createFromBytes(user, { purpose: "document-version", fileName: "a.pdf", mimeType: "application/pdf", bytes });
    await expect(uploadService.summary("up1", { id: "u2" })).rejects.toMatchObject({ status: 404 });
    await expect(uploadService.summary("nope", user)).rejects.toMatchObject({ status: 404 });
    sessions.set("up1", { ...sessions.get("up1")!, expiresAt: new Date(Date.now() - 1000) });
    await expect(uploadService.summary("up1", user)).rejects.toMatchObject({ status: 404 });
    sessions.set("up1", { ...sessions.get("up1")!, expiresAt: new Date(Date.now() + 60_000), status: "CONSUMED" });
    await expect(uploadService.summary("up1", user)).rejects.toMatchObject({ status: 404 });
  });
});
