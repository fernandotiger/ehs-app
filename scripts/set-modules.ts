/**
 * Switch modules on or off for a tenant (platform operation – tenants see the result read-only
 * in Configuration → Subscription; billing is not connected).
 *
 *   npm run tenant:modules -- --slug acme --modules documents,incidents   (exact set)
 *   npm run tenant:modules -- --slug acme --enable risk --disable law       (relative change)
 *   npm run tenant:modules -- --slug acme                                   (show current)
 *   [--plan professional]
 *
 * Local database: bash scripts/localdb.sh npm run tenant:modules -- …
 */
import "dotenv/config";
import { parseArgs } from "node:util";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { MODULE_KEYS } from "../src/lib/modules";
import { normaliseModules, ProvisioningError } from "../src/server/tenancy/provisioning";

function usage(message?: string): never {
  if (message) console.error(`Error: ${message}\n`);
  console.error(
    [
      "Usage: npm run tenant:modules -- --slug <slug> [--modules a,b | --enable a,b --disable c] [--plan <plan>]",
      `Modules: ${MODULE_KEYS.join(", ")}`,
    ].join("\n"),
  );
  process.exit(1);
}

const list = (value: string | undefined) => (value ? value.split(",").map((m) => m.trim()).filter(Boolean) : []);

async function main() {
  const { values } = parseArgs({
    options: {
      slug: { type: "string" },
      modules: { type: "string" },
      enable: { type: "string" },
      disable: { type: "string" },
      plan: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
    strict: true,
  });
  if (values.help) usage();
  if (!values.slug) usage("missing --slug");
  if (values.modules && (values.enable || values.disable)) usage("use either --modules or --enable/--disable");

  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!url) usage("DATABASE_URL is not set");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  try {
    const org = await prisma.organization.findUnique({ where: { slug: values.slug } });
    if (!org) usage(`no organisation with slug "${values.slug}"`);

    const changing = Boolean(values.modules || values.enable || values.disable || values.plan);
    if (!changing) {
      console.log(`${org.name} (${org.slug}) – plan ${org.plan}`);
      console.log(`  enabled modules: ${org.enabledModules.join(", ") || "(none)"}`);
      return;
    }

    let next = org.enabledModules;
    if (values.modules) next = normaliseModules(list(values.modules));
    else {
      const enable = normaliseModules(list(values.enable));
      const disable = normaliseModules(list(values.disable));
      next = normaliseModules([...new Set([...org.enabledModules, ...enable])].filter((m) => !disable.includes(m as never)));
    }

    await prisma.organization.update({
      where: { id: org.id },
      data: { enabledModules: next, ...(values.plan ? { plan: values.plan } : {}), version: { increment: 1 } },
    });
    console.log(`${org.name} (${org.slug})`);
    console.log(`  modules: ${org.enabledModules.join(", ") || "(none)"}  →  ${next.join(", ") || "(none)"}`);
    if (values.plan) console.log(`  plan:    ${org.plan}  →  ${values.plan}`);
    console.log("  People see the change on their next page load.");
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
