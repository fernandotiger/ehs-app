import "server-only";
import { z } from "zod";

/**
 * Centralised, validated server configuration.
 * All infrastructure choices (database driver, storage driver) are driven from here
 * so they can be swapped per environment without code changes.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  DATABASE_DRIVER: z.enum(["neon", "pg"]).default("pg"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  /** Max pooled connections per server instance (optional; driver default otherwise). */
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).optional(),
  /** Close pooled connections after this many idle milliseconds (optional). */
  DATABASE_IDLE_TIMEOUT_MS: z.coerce.number().int().min(1).optional(),

  STORAGE_DRIVER: z.enum(["local", "vercel-blob", "s3"]).default("local"),
  LOCAL_STORAGE_DIR: z.string().default("./storage"),
  BLOB_READ_WRITE_TOKEN: z.string().optional(),
  S3_BUCKET: z.string().optional(),
  S3_REGION: z.string().optional(),
  S3_ENDPOINT: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),

  BETTER_AUTH_SECRET: z.string().min(16, "BETTER_AUTH_SECRET must be at least 16 characters"),
  BETTER_AUTH_URL: z.string().url().optional(),
  AUDIT_SIGNING_SECRET: z.string().optional(),
  CRON_SECRET: z.string().optional(),

  /** OpenRouter key for the AI assistant (optional – without it the assistant shows "not set up yet"). Server-only, never logged. */
  OPENROUTER_API_KEY: z
    .string()
    .optional()
    .transform((v) => v?.trim() || undefined),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

export function env(): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  if (parsed.data.STORAGE_DRIVER === "s3" && !parsed.data.S3_BUCKET) {
    throw new Error("S3_BUCKET is required when STORAGE_DRIVER=s3");
  }
  cached = parsed.data;
  return cached;
}
