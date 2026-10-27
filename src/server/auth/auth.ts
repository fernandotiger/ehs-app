import "server-only";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { env } from "@/server/config/env";
import { systemPrisma } from "@/server/db/client";

/**
 * Authentication (Better Auth, email + password, database sessions).
 *
 * Public sign-up is disabled: accounts are provisioned by tenant administrators
 * (Configuration → Users) or by scripts/create-tenant.ts. Auth tables are global, so this
 * uses the unscoped client; the tenant is derived from the user after sign-in. Authorisation is handled separately by our
 * own RBAC layer (src/server/auth/authorization.ts).
 */
export const auth = betterAuth({
  secret: env().BETTER_AUTH_SECRET,
  baseURL: env().BETTER_AUTH_URL,
  database: prismaAdapter(systemPrisma, { provider: "postgresql" }),
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    minPasswordLength: 8,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 14, // 14 days – long lived for offline-capable PWA use
    updateAge: 60 * 60 * 24,
    cookieCache: { enabled: true, maxAge: 5 * 60 },
  },
  user: {
    additionalFields: {
      isActive: { type: "boolean", required: false, input: false },
    },
  },
  databaseHooks: {
    session: {
      create: {
        // Deactivated users cannot sign in.
        before: async (session) => {
          const user = await systemPrisma.user.findUnique({ where: { id: session.userId }, select: { isActive: true } });
          if (!user?.isActive) return false;
          return { data: session };
        },
      },
    },
  },
  plugins: [nextCookies()],
});

export type AuthSession = typeof auth.$Infer.Session;
