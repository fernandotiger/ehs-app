/**
 * Give the demo tenants of an existing database their AI assistant settings (prisma/seed/assistant.ts:
 * built-in guide, welcome text, free OpenRouter model) without re-running the whole seed.
 * Idempotent: a tenant that already has settings is left alone.
 *
 *   bash scripts/localdb.sh npm run db:seed:assistant
 *
 * Refuses a database that is not on this machine unless ALLOW_REMOTE_SEED=1 is set.
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { applyDemoAssistant } from "../prisma/seed/assistant";
import { PrismaClient } from "../src/generated/prisma/client";

const DEMO_TENANTS = ["northstar", "oleo-demo"];

async function main() {
  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const host = new URL(url).hostname;
  if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(host) && process.env.ALLOW_REMOTE_SEED !== "1") {
    throw new Error(`Refusing to change ${host}: run it through scripts/localdb.sh, or set ALLOW_REMOTE_SEED=1 on purpose.`);
  }
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  try {
    for (const slug of DEMO_TENANTS) {
      const org = await prisma.organization.findUnique({ where: { slug }, select: { id: true, name: true } });
      if (!org) {
        console.log(`${slug}: not found – skipped`);
        continue;
      }
      console.log(`${org.name}:`, JSON.stringify(await applyDemoAssistant(prisma, org.id)));
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
