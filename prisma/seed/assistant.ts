import type { PrismaClient } from "../../src/generated/prisma/client";
import { defaultAssistantConfig } from "../../src/server/modules/assistant/default-config";

/**
 * AI assistant settings for a demo tenant: the built-in "How to use OleoQ" guide, welcome text,
 * suggestions and the free OpenRouter model (src/server/modules/assistant/default-config.ts).
 * Idempotent: a tenant that already has a row keeps it (company edits are never overwritten).
 * The OpenRouter key is NOT seeded – it is the OPENROUTER_API_KEY env var.
 */
export async function applyDemoAssistant(prisma: PrismaClient, organizationId: string): Promise<{ created: boolean }> {
  const existing = await prisma.assistantConfig.findUnique({ where: { organizationId }, select: { id: true } });
  if (existing) return { created: false };
  await prisma.assistantConfig.create({ data: { organizationId, ...defaultAssistantConfig() } });
  return { created: true };
}
