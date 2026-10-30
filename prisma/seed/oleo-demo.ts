import type { PrismaClient } from "../../src/generated/prisma/client";
import { SYSTEM_ROLE_KEYS as R } from "../../src/lib/permissions";
import { provisionTenant } from "../../src/server/tenancy/provisioning";
import { applyDemoAssistant } from "./assistant";
import { DEMO_PASSWORD, seedStructure, seedUsers, type TenantSeed } from "./common";
import { seedDocuments } from "./documents";
import { OLEO_DEMO_INCIDENTS, seedIncidents } from "./incidents";

/**
 * Oleo Demo Ltd – a second, small tenant (Documents + Incidents) used to prove isolation:
 * none of its people, structure or documents may ever be visible from Northstar and vice versa.
 */
export async function seedOleoDemo(prisma: PrismaClient): Promise<TenantSeed> {
  const tenant = await provisionTenant(prisma, {
    name: "Oleo Demo Ltd",
    slug: "oleo-demo",
    adminEmail: "admin@oleo-demo.example",
    adminName: "Morgan Kelly",
    password: DEMO_PASSWORD,
    // Actions: the actions migration switches the module on for existing tenants; a fresh seed matches it.
    modules: ["documents", "incidents", "actions"],
    branding: { primary: "#1f6f5c", secondary: "#134438", tertiary: "#3fa58a" },
  });
  const seed: TenantSeed = {
    organizationId: tenant.organizationId,
    name: "Oleo Demo Ltd",
    roles: tenant.roles,
    businessUnits: new Map(),
    sites: new Map(),
    locations: new Map(),
    departments: new Map(),
    users: new Map(),
  };
  await seedStructure(prisma, seed, {
    businessUnits: [{ name: "Head Office" }],
    sites: [{ name: "Galway Office", businessUnit: "Head Office" }],
    locations: [{ name: "Main Building", site: "Galway Office" }],
    departments: [{ name: "Administration", location: "Main Building" }],
  });
  await seedUsers(prisma, seed, [
    { email: "admin@oleo-demo.example", name: "Morgan Kelly", jobTitle: "Managing Director", employeeNumber: "OD001", at: { department: "Administration" }, roles: [{ role: R.EMPLOYEE }] },
    { email: "jordan@oleo-demo.example", name: "Jordan Lee", jobTitle: "Office Coordinator", employeeNumber: "OD002", at: { department: "Administration" }, roles: [{ role: R.EMPLOYEE }], manager: "admin@oleo-demo.example" },
  ]);
  await seedDocuments(prisma, seed, {
    author: "admin@oleo-demo.example",
    categories: ["Policies"],
    documents: [
      {
        title: "Oleo Demo Health & Safety Statement",
        referenceCode: "OD-HS-001",
        category: "Policies",
        description: "Our commitment to a safe and healthy workplace.",
        status: "PUBLISHED",
        publishedDaysAgo: 20,
        audiences: [{ type: "ALL_EMPLOYEES" }],
        requiresAcknowledgement: true,
        ackDueDays: 14,
        versions: [{ daysAgo: 20, changeNote: "Initial version", body: "Everyone at Oleo Demo has the right to go home safe. Report hazards and incidents straight away." }],
        ackShare: { 1: 0.5 },
      },
      {
        title: "Oleo Demo Visitor Rules",
        referenceCode: "OD-VR-001",
        category: "Policies",
        description: "What visitors to the Galway office need to know.",
        status: "PUBLISHED",
        publishedDaysAgo: 8,
        audiences: [{ type: "SITE", site: "Galway Office" }],
        requiresAcknowledgement: false,
        versions: [{ daysAgo: 8, changeNote: "Initial version", body: "Sign in at reception, wear your visitor badge and stay with your host." }],
      },
    ],
  });
  const adminId = seed.users.get("admin@oleo-demo.example") ?? null;
  await seedIncidents(prisma, seed, OLEO_DEMO_INCIDENTS, adminId ? { id: adminId, name: "Morgan Kelly" } : null);
  await applyDemoAssistant(prisma, seed.organizationId);
  return seed;
}
