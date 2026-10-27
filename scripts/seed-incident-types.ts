/**
 * Apply the demo incident types (Port of Cork types, subtypes and one Report + Investigation form
 * per type – prisma/seed/incident-types.ts) to the demo tenants of an existing database, without
 * re-running the whole seed. Idempotent; incidents already reported keep their labels and forms.
 *
 *   bash scripts/localdb.sh npm run db:seed:incident-types
 *
 * Refuses a database that is not on this machine unless ALLOW_REMOTE_SEED=1 is set.
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { applyDemoIncidentTypes } from "../prisma/seed/incident-types";
import { PrismaClient } from "../src/generated/prisma/client";

const DEMO_TENANTS = [
  { slug: "northstar", admin: "admin@northstar.example" },
  { slug: "oleo-demo", admin: "admin@oleo-demo.example" },
];

async function main() {
  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const host = new URL(url).hostname;
  if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(host) && process.env.ALLOW_REMOTE_SEED !== "1") {
    throw new Error(`Refusing to change ${host}: run it through scripts/localdb.sh, or set ALLOW_REMOTE_SEED=1 on purpose.`);
  }
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  try {
    for (const tenant of DEMO_TENANTS) {
      const org = await prisma.organization.findUnique({ where: { slug: tenant.slug }, select: { id: true, name: true } });
      if (!org) {
        console.log(`${tenant.slug}: not found – skipped`);
        continue;
      }
      const admin = await prisma.user.findUnique({ where: { email: tenant.admin }, select: { id: true, name: true } });
      const result = await applyDemoIncidentTypes(prisma, org.id, admin);
      console.log(`${org.name}:`, JSON.stringify(result));
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
