import "dotenv/config";
import { defineConfig } from "prisma/config";

// Migrations should run against a direct (non-pooled) connection.
// On Neon set DIRECT_URL to the non-pooled connection string; locally DATABASE_URL is enough.
export default defineConfig({
  schema: "prisma/schema",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
    // Local `prisma dev` (PGlite) serves one physical database per port, so Migrate cannot create a
    // temporary shadow database next to the main one; use the dedicated shadow server instead.
    ...(process.env.SHADOW_DATABASE_URL ? { shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL } : {}),
  },
});
