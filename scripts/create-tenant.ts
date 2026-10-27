/**
 * Create a tenant (company) with default roles, lists, settings and its first administrator.
 *
 *   npm run tenant:create -- --name "Acme Ltd" --slug acme --admin-email jo@acme.example \
 *     --admin-name "Jo Bloggs" --password "a-strong-password" [--modules documents,incidents]
 *
 * Local database: bash scripts/localdb.sh npm run tenant:create -- …
 */
import "dotenv/config";
import { parseArgs } from "node:util";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { MODULE_KEYS } from "../src/lib/modules";
import { provisionTenant, ProvisioningError } from "../src/server/tenancy/provisioning";

function usage(message?: string): never {
  if (message) console.error(`Error: ${message}\n`);
  console.error(
    [
      "Usage: npm run tenant:create -- --name <name> --slug <slug> --admin-email <email> --admin-name <name> --password <password> [--modules a,b]",
      `Modules: ${MODULE_KEYS.join(", ")} (default: all)`,
    ].join("\n"),
  );
  process.exit(1);
}

async function main() {
  const { values } = parseArgs({
    options: {
      name: { type: "string" },
      slug: { type: "string" },
      "admin-email": { type: "string" },
      "admin-name": { type: "string" },
      password: { type: "string" },
      modules: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
    strict: true,
  });
  if (values.help) usage();
  const required = ["name", "slug", "admin-email", "admin-name", "password"] as const;
  const missing = required.filter((k) => !values[k]);
  if (missing.length) usage(`missing ${missing.map((m) => `--${m}`).join(", ")}`);

  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!url) usage("DATABASE_URL is not set");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  try {
    const result = await provisionTenant(prisma, {
      name: values.name!,
      slug: values.slug!,
      adminEmail: values["admin-email"]!,
      adminName: values["admin-name"]!,
      password: values.password!,
      modules: values.modules ? values.modules.split(",").map((m) => m.trim()).filter(Boolean) : undefined,
      failIfExists: true,
    });
    console.log(`Created tenant "${values.name}" (${values.slug})`);
    console.log(`  organizationId: ${result.organizationId}`);
    console.log(`  administrator:  ${values["admin-email"]} (protected Administrator, whole company)`);
  } catch (error) {
    if (error instanceof ProvisioningError) usage(error.message);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
