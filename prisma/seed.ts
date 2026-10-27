import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { DEMO_PASSWORD } from "./seed/common";
import { seedNorthstar } from "./seed/northstar";
import { seedOleoDemo } from "./seed/oleo-demo";

/**
 * Demo data for two tenants. Run with `bash scripts/localdb.sh npm run db:seed` (idempotent:
 * structure/users/roles are upserted, documents are skipped when a tenant already has some).
 * Uses an UNSCOPED client: every write passes organizationId explicitly.
 */
async function main() {
  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

  try {
    console.log("Seeding Northstar Manufacturing (northstar)…");
    await seedNorthstar(prisma);
    console.log("Seeding Oleo Demo Ltd (oleo-demo)…");
    await seedOleoDemo(prisma);
    console.log(`\nDone. Demo password for every account: ${DEMO_PASSWORD} (development only)`);
    console.log("  Northstar: admin@ (Administrator) · sam@ (Site Manager, Dublin Plant) · priya@ (Employee/Inspector)");
    console.log("             helen@ (HR Admin) · emma@ (EHS Manager) · liam@ (EHS Investigator) · sarah@ (Manager, Cork) · john@ (Employee)");
    console.log("             …all @northstar.example");
    console.log("  Oleo Demo: admin@oleo-demo.example (Administrator) · jordan@oleo-demo.example (Employee)");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
