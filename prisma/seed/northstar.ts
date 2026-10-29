import type { PrismaClient } from "../../src/generated/prisma/client";
import { MODULE_KEYS } from "../../src/lib/modules";
import { SYSTEM_ROLE_KEYS as R } from "../../src/lib/permissions";
import { provisionTenant } from "../../src/server/tenancy/provisioning";
import { DEMO_PASSWORD, seedStructure, seedUsers, type TenantSeed, type UserSpec } from "./common";
import { applyDemoActions } from "./actions";
import { seedDocumentSurveys } from "./document-surveys";
import { seedDocuments, type DocumentSpec } from "./documents";
import { seedForms } from "./forms";
import { seedJobs } from "./jobs";
import { NORTHSTAR_INCIDENTS, seedIncidents } from "./incidents";
import { applyDemoLaw } from "./law";
import { seedRisk } from "./risk";
import { applyDemoRiskHazards } from "./risk-hazards";
import { applyDemoSimplifiedLaw } from "./simplified-law";

/**
 * Northstar Manufacturing – the main demo tenant (every module enabled).
 * Structure, personas, Documents demo data, published forms and scheduled jobs. Idempotent.
 */

const STRUCTURE = {
  businessUnits: [{ name: "Operations", code: "OPS" }],
  sites: [
    { name: "Dublin Plant", businessUnit: "Operations", code: "DUB", address: "Port Tunnel Road, Dublin 1" },
    { name: "Cork Distribution", businessUnit: "Operations", code: "CRK", address: "Little Island, Co. Cork" },
  ],
  locations: [
    { name: "Production Floor", site: "Dublin Plant", code: "DUB-PF" },
    { name: "Warehouse", site: "Cork Distribution", code: "CRK-WH" },
  ],
  departments: [
    { name: "Engineering", location: "Production Floor", code: "ENG" },
    { name: "Operations", location: "Production Floor", code: "OPS" },
    { name: "Port Central Management & Admin", location: "Production Floor", code: "ADM" },
    { name: "Whole Site", location: "Production Floor", code: "SITE" },
    { name: "Third Parties", location: "Warehouse", code: "3P" },
  ],
};

const EMPLOYEE = { role: R.EMPLOYEE };

const PERSONAS: UserSpec[] = [
  {
    email: "admin@northstar.example",
    name: "Alex Morgan",
    jobTitle: "Operations Director",
    employeeNumber: "N0001",
    at: { department: "Port Central Management & Admin" },
    roles: [EMPLOYEE],
  },
  {
    email: "sam@northstar.example",
    name: "Sam O'Brien",
    jobTitle: "Site Manager",
    employeeNumber: "N0002",
    at: { department: "Whole Site" },
    roles: [EMPLOYEE, { role: R.MANAGER, scope: "SITE", at: "Dublin Plant" }, { role: R.EHS_MANAGER, scope: "SITE", at: "Dublin Plant" }],
    manager: "admin@northstar.example",
  },
  {
    email: "priya@northstar.example",
    name: "Priya Shah",
    jobTitle: "Maintenance Engineer & Inspector",
    employeeNumber: "N0003",
    at: { department: "Engineering" },
    roles: [EMPLOYEE, { role: R.INSPECTOR }],
    manager: "sam@northstar.example",
  },
  {
    email: "helen@northstar.example",
    name: "Helen Hughes",
    jobTitle: "HR Manager",
    employeeNumber: "N0004",
    at: { department: "Port Central Management & Admin" },
    roles: [EMPLOYEE, { role: R.HR_ADMIN }, { role: R.MANAGER }],
    manager: "admin@northstar.example",
  },
  {
    email: "emma@northstar.example",
    name: "Emma Walsh",
    jobTitle: "EHS Manager",
    employeeNumber: "N0005",
    at: { department: "Port Central Management & Admin" },
    roles: [EMPLOYEE, { role: R.EHS_MANAGER }, { role: R.MANAGER }],
    manager: "admin@northstar.example",
  },
  {
    email: "liam@northstar.example",
    name: "Liam Byrne",
    jobTitle: "EHS Officer",
    employeeNumber: "N0006",
    at: { location: "Warehouse" },
    roles: [EMPLOYEE, { role: R.EHS_INVESTIGATOR }],
    manager: "emma@northstar.example",
  },
  {
    email: "sarah@northstar.example",
    name: "Sarah O'Connor",
    jobTitle: "Operations Manager",
    employeeNumber: "N0007",
    at: { location: "Warehouse" },
    roles: [EMPLOYEE, { role: R.MANAGER, scope: "SITE", at: "Cork Distribution" }],
    manager: "admin@northstar.example",
  },
  {
    email: "john@northstar.example",
    name: "John Murphy",
    jobTitle: "Warehouse Operative",
    employeeNumber: "N0008",
    at: { location: "Warehouse" },
    roles: [EMPLOYEE],
    manager: "sarah@northstar.example",
  },
];

const FIRST = ["Aoife", "Ciara", "Niamh", "Sean", "Conor", "Darragh", "Orla", "Padraig", "Roisin", "Eoin", "Grainne", "Cian", "Siobhan", "Declan", "Fiona", "Kevin", "Laura", "Mark", "Nora", "Owen"];
const LAST = ["Brennan", "Doyle", "Fitzgerald", "Gallagher", "Healy", "Kennedy", "Lynch", "McCarthy", "Nolan", "Quinn", "Ryan", "Sheehan", "Power", "Daly"];
const PLACES: { at: UserSpec["at"]; jobTitle: string; manager: string }[] = [
  { at: { department: "Operations" }, jobTitle: "Production Operative", manager: "sam@northstar.example" },
  { at: { department: "Engineering" }, jobTitle: "Maintenance Technician", manager: "sam@northstar.example" },
  { at: { location: "Warehouse" }, jobTitle: "Warehouse Operative", manager: "sarah@northstar.example" },
  { at: { department: "Whole Site" }, jobTitle: "Shift Supervisor", manager: "sam@northstar.example" },
  { at: { department: "Third Parties" }, jobTitle: "Contractor", manager: "sarah@northstar.example" },
  { at: { department: "Port Central Management & Admin" }, jobTitle: "Administrator", manager: "helen@northstar.example" },
];

function generatedEmployees(count: number): UserSpec[] {
  return Array.from({ length: count }, (_, i) => {
    const first = FIRST[i % FIRST.length]!;
    const last = LAST[(i * 7) % LAST.length]!;
    const place = PLACES[i % PLACES.length]!;
    return {
      email: `${first}.${last}${i}@northstar.example`.toLowerCase(),
      name: `${first} ${last}`,
      jobTitle: place.jobTitle,
      employeeNumber: `N${String(100 + i).padStart(4, "0")}`,
      at: place.at,
      roles: [EMPLOYEE],
      manager: place.manager,
    };
  });
}

const LOREM =
  "This document sets out the expectations that apply to everyone in scope. Read each section carefully and speak to your line manager or the HR team if anything is unclear.";

const DOCUMENTS: DocumentSpec[] = [
  {
    title: "Annual Leave Policy 2026",
    referenceCode: "HR-POL-001",
    category: "Policies",
    description: "How annual leave is accrued, requested and approved during 2026.",
    status: "PUBLISHED",
    publishedDaysAgo: 10,
    audiences: [{ type: "ALL_EMPLOYEES" }],
    requiresAcknowledgement: true,
    ackDueDays: 14,
    versions: [{ daysAgo: 10, changeNote: "Initial version", body: `1. Entitlement\nFull-time employees are entitled to 22 days of annual leave per year, plus public holidays.\n\n2. Requesting leave\nSubmit requests at least two weeks in advance. Managers respond within five working days.\n\n3. Carry over\nUp to five unused days may be carried into the first quarter of 2027.\n\n${LOREM}` }],
    ackShare: { 1: 0.55 },
  },
  {
    title: "Manager Absence Procedure",
    referenceCode: "HR-PRO-004",
    category: "Procedures",
    description: "Steps line managers follow when a team member reports absence.",
    status: "PUBLISHED",
    publishedDaysAgo: 5,
    audiences: [{ type: "ROLE", roleKey: R.MANAGER }],
    requiresAcknowledgement: true,
    ackDueDays: 10,
    escalationTarget: "HR",
    versions: [{ daysAgo: 5, changeNote: "Initial version", body: `Managers only.\n\n1. Record the absence on the day it is reported.\n2. Hold a return-to-work conversation within two working days.\n3. Refer long-term absence (over 20 days) to HR and Occupational Health.\n\n${LOREM}` }],
    ackShare: { 1: 0.5 },
  },
  {
    title: "Operations Handbook",
    referenceCode: "OPS-HB-001",
    category: "Handbooks",
    description: "Day-to-day operating standards for the Operations department.",
    status: "PUBLISHED",
    publishedDaysAgo: 45,
    audiences: [{ type: "DEPARTMENT", department: "Operations" }],
    requiresAcknowledgement: false,
    versions: [{ daysAgo: 45, changeNote: "Initial version", body: `Shift handovers, KPIs, escalation contacts and quality checks for the Operations team.\n\n${LOREM}` }],
  },
  {
    title: "Warehouse Safety Policy",
    referenceCode: "EHS-POL-010",
    category: "Safety",
    description: "Safe working in the warehouse: PPE, racking, pedestrian routes and forklifts.",
    status: "PUBLISHED",
    publishedDaysAgo: 30,
    audiences: [{ type: "LOCATION", location: "Warehouse" }],
    requiresAcknowledgement: true,
    ackDueDays: 14,
    versions: [{ daysAgo: 30, changeNote: "Initial version", body: `1. High-visibility vests and safety boots must be worn at all times.\n2. Keep to marked pedestrian walkways.\n3. Report damaged racking immediately.\n4. Only certified operators may drive forklifts.\n\n${LOREM}` }],
    ackShare: { 1: 0.4 },
  },
  {
    title: "Fire Safety Policy",
    referenceCode: "EHS-POL-002",
    category: "Safety",
    description: "Fire prevention, alarms, evacuation and assembly points at Dublin Plant.",
    status: "PUBLISHED",
    publishedDaysAgo: 90,
    audiences: [{ type: "SITE", site: "Dublin Plant" }],
    requiresAcknowledgement: true,
    ackDueDays: 14,
    escalationTarget: "MANAGER",
    versions: [
      { daysAgo: 90, changeNote: "Initial version", body: `1. Know your nearest exit and assembly point.\n2. Never block fire doors.\n3. Test alarms weekly.\n\n${LOREM}` },
      {
        daysAgo: 25,
        changeNote: "New assembly points and fire warden rota after site changes.",
        requiresReacknowledgement: true,
        body: `Version 2 - updated assembly points.\n\n1. Know your nearest exit and the NEW assembly point.\n2. Never block fire doors.\n3. Fire wardens are listed on each floor.\n\n${LOREM}`,
      },
    ],
    ackShare: { 1: 0.9, 2: 0.65 },
  },
  {
    title: "Cork Distribution Site Rules",
    referenceCode: "CRK-SR-001",
    category: "Safety",
    description: "Site-specific rules for visitors and staff at Cork Distribution.",
    status: "PUBLISHED",
    publishedDaysAgo: 40,
    audiences: [{ type: "SITE", site: "Cork Distribution" }],
    requiresAcknowledgement: true,
    ackDueDays: 21,
    versions: [{ daysAgo: 40, changeNote: "Initial version", body: `Sign in at reception, wear hearing protection in the loading bays, and follow the one-way traffic system.\n\n${LOREM}` }],
    ackShare: { 1: 0.5 },
  },
  {
    title: "Operations Code of Conduct",
    referenceCode: "OPS-COC-001",
    category: "Policies",
    description: "How we work together across the Operations business unit.",
    status: "PUBLISHED",
    publishedDaysAgo: 60,
    audiences: [{ type: "BUSINESS_UNIT", businessUnit: "Operations" }],
    requiresAcknowledgement: true,
    ackDueDays: 30,
    versions: [{ daysAgo: 60, changeNote: "Initial version", body: `Respect, honesty and safety first. Speak up about unsafe behaviour and report incidents promptly.\n\n${LOREM}` }],
    ackShare: { 1: 0.7 },
  },
  {
    title: "Confined Space Entry Permit Guide",
    referenceCode: "MNT-GD-007",
    category: "Procedures",
    description: "For named staff authorised to enter confined spaces.",
    status: "PUBLISHED",
    publishedDaysAgo: 12,
    audiences: [
      { type: "USER", email: "priya@northstar.example" },
      { type: "USER", email: "liam@northstar.example" },
    ],
    requiresAcknowledgement: true,
    ackDueDays: 7,
    versions: [{ daysAgo: 12, changeNote: "Initial version", body: `Permit-to-work steps, gas monitoring and buddy system for confined space entry.\n\n${LOREM}` }],
  },
  {
    title: "Lone Working Procedure",
    referenceCode: "EHS-PRO-015",
    category: "Procedures",
    description: "Draft – under review by the EHS committee.",
    status: "DRAFT",
    audiences: [{ type: "ALL_EMPLOYEES" }],
    requiresAcknowledgement: true,
    ackDueDays: 14,
    versions: [{ daysAgo: 2, changeNote: "Initial draft", body: `Check-in intervals, lone worker devices and emergency response.\n\n${LOREM}` }],
  },
  {
    title: "Annual Leave Policy 2025",
    referenceCode: "HR-POL-001-2025",
    category: "Policies",
    description: "Superseded by the 2026 policy.",
    status: "ARCHIVED",
    publishedDaysAgo: 400,
    archivedDaysAgo: 10,
    audiences: [{ type: "ALL_EMPLOYEES" }],
    requiresAcknowledgement: false,
    versions: [{ daysAgo: 400, changeNote: "Initial version", body: `2025 leave year rules.\n\n${LOREM}` }],
  },
];

export async function seedNorthstar(prisma: PrismaClient): Promise<TenantSeed> {
  const tenant = await provisionTenant(prisma, {
    name: "Northstar Manufacturing",
    slug: "northstar",
    adminEmail: "admin@northstar.example",
    adminName: "Alex Morgan",
    password: DEMO_PASSWORD,
    modules: MODULE_KEYS,
  });
  const seed: TenantSeed = {
    organizationId: tenant.organizationId,
    name: "Northstar Manufacturing",
    roles: tenant.roles,
    businessUnits: new Map(),
    sites: new Map(),
    locations: new Map(),
    departments: new Map(),
    users: new Map(),
  };
  console.log("  • structure");
  await seedStructure(prisma, seed, STRUCTURE);
  console.log("  • people & role assignments");
  await seedUsers(prisma, seed, [...PERSONAS, ...generatedEmployees(30)]);
  console.log("  • documents");
  await seedDocuments(prisma, seed, {
    author: "helen@northstar.example",
    categories: ["Policies", "Procedures", "Safety", "Handbooks"],
    documents: DOCUMENTS,
    outstanding: ["john@northstar.example"],
    acknowledged: { "HR-POL-001": ["sarah@northstar.example"] },
  });
  console.log("  • document surveys");
  await seedDocumentSurveys(prisma, seed, { author: "helen@northstar.example" });
  const adminId = seed.users.get("admin@northstar.example") ?? null;
  console.log("  • forms (Risk 5×5, FMEA, Checklist)");
  await seedForms(prisma, seed, adminId ? { id: adminId, name: "Alex Morgan" } : null);
  console.log("  • scheduled jobs");
  await seedJobs(prisma, seed, adminId);
  console.log("  • incidents (Port of Cork types + forms, reports, investigations, actions)");
  await seedIncidents(prisma, seed, NORTHSTAR_INCIDENTS, adminId ? { id: adminId, name: "Alex Morgan" } : null);
  console.log("  • risk (assessments, revisions, reviews, objectives, programmes, tasks)");
  await seedRisk(prisma, seed);
  console.log("  • risk hazard / aspect lists");
  await applyDemoRiskHazards(prisma, seed.organizationId);
  console.log("  • standalone actions (Action details form, demo actions)");
  await applyDemoActions(prisma, seed.organizationId);
  console.log("  • law (legal content 2026.Q3, Non Compliance type, profiles, evaluations, tasks, links)");
  await applyDemoLaw(prisma, seed.organizationId);
  console.log("  • simplified law (real Irish / EU legislation, demo answers and actions)");
  await applyDemoSimplifiedLaw(prisma, seed.organizationId);
  return seed;
}
