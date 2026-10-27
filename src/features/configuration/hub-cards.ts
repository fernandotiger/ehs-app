import {
  Building2,
  CreditCard,
  FileSpreadsheet,
  FormInput,
  Grid3x3,
  Hash,
  History,
  ListTree,
  Palette,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Timer,
  TriangleAlert,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { ModuleKey } from "@/lib/modules";
import { PERMISSIONS, type Permission } from "@/lib/permissions";

/**
 * Configuration hub (/configuration) – one card per setup screen, grouped. A card is shown when
 * the user holds ANY of its permissions; cards without `href` render as "Coming soon".
 * Later phases add an `href` when they build the screen.
 */
export interface HubCard {
  key: string;
  title: string;
  description: string;
  icon: LucideIcon;
  permissions: Permission[];
  href?: string;
  /** Shown only when the tenant has enabled this module. */
  module?: ModuleKey;
}

export interface HubGroup {
  key: string;
  title: string;
  cards: HubCard[];
}

const P = PERMISSIONS;

export const CONFIGURATION_GROUPS: HubGroup[] = [
  {
    key: "organisation",
    title: "Organisation",
    cards: [
      { key: "structure", title: "Company structure", description: "Business units, sites, locations and departments.", icon: Building2, permissions: [P.ADMIN_ORGANISATION], href: "/configuration/structure" },
      { key: "users", title: "Users", description: "People in your company directory.", icon: Users, permissions: [P.ADMIN_USERS], href: "/configuration/users" },
    ],
  },
  {
    key: "access",
    title: "Access",
    cards: [
      { key: "roles", title: "Roles & permissions", description: "What each role can do and where it applies.", icon: ShieldCheck, permissions: [P.ADMIN_ROLES], href: "/configuration/roles" },
      { key: "import", title: "Bulk import", description: "Load structure, users and lists from a CSV file.", icon: FileSpreadsheet, permissions: [P.CONFIG_BULK_IMPORT], href: "/configuration/import" },
    ],
  },
  {
    key: "automation",
    title: "Forms & automation",
    cards: [
      {
        key: "forms",
        title: "Form Builder",
        description: "Questionnaires for incident reports, investigations and risk assessments.",
        icon: FormInput,
        permissions: [P.FORMS_VIEW, P.FORMS_DESIGN, P.FORMS_PUBLISH],
        href: "/configuration/forms",
      },
      {
        key: "jobs",
        title: "Scheduled jobs",
        description: "Reminders and digests sent on a schedule.",
        icon: Timer,
        permissions: [P.CONFIG_JOBS_VIEW, P.CONFIG_JOBS_MANAGE, P.CONFIG_JOBS_TEST],
        href: "/configuration/jobs",
      },
      {
        key: "incident-settings",
        title: "Incident settings",
        description: "Incident types, subtypes, causes, reportees and export columns.",
        icon: TriangleAlert,
        permissions: [P.INCIDENT_CONFIGURE],
        href: "/configuration/incidents",
        module: "incidents",
      },
      {
        key: "risk-matrix",
        title: "Risk matrix & review rules",
        description: "Medium / High / Critical values, review frequency, notice days and sites of each Risk form.",
        icon: Grid3x3,
        permissions: [P.RISK_CONFIGURE],
        href: "/configuration/risk",
        module: "risk",
      },
      { key: "module-settings", title: "Module settings", description: "Setup for the later modules (Audit, Inspection, Law).", icon: SlidersHorizontal, permissions: [P.ADMIN_SETTINGS] },
    ],
  },
  {
    key: "customisation",
    title: "Customisation",
    cards: [
      { key: "lists", title: "Lists & categories", description: "Categories, templates and other pick-lists.", icon: ListTree, permissions: [P.CONFIG_LISTS], href: "/configuration/lists" },
      { key: "numbering", title: "Reference numbers", description: "Prefixes and formats such as INC-2026-0001.", icon: Hash, permissions: [P.CONFIG_LISTS], href: "/configuration/numbering" },
      { key: "branding", title: "Branding", description: "Logo, company name and colours.", icon: Palette, permissions: [P.CONFIG_BRANDING], href: "/configuration/branding" },
    ],
  },
  {
    key: "account",
    title: "Account",
    cards: [
      { key: "settings", title: "System settings", description: "Time zone, upload limits and acknowledgement defaults.", icon: Settings, permissions: [P.ADMIN_SETTINGS], href: "/configuration/settings" },
      { key: "audit-log", title: "Audit log", description: "Signed history of every change.", icon: History, permissions: [P.ADMIN_AUDIT], href: "/configuration/audit-log" },
      { key: "subscription", title: "Subscription", description: "Your plan and enabled modules.", icon: CreditCard, permissions: [P.CONFIG_SUBSCRIPTION], href: "/configuration/subscription" },
    ],
  },
];

/** Every permission that unlocks at least one card – the Configuration menu item uses this. */
export const CONFIGURATION_PERMISSIONS: Permission[] = [...new Set(CONFIGURATION_GROUPS.flatMap((g) => g.cards.flatMap((c) => c.permissions)))];

export function visibleGroups(permissions: readonly Permission[], enabledModules?: readonly string[]): HubGroup[] {
  return CONFIGURATION_GROUPS.map((g) => ({
    ...g,
    cards: g.cards.filter((c) => c.permissions.some((p) => permissions.includes(p)) && (!c.module || !enabledModules || enabledModules.includes(c.module))),
  })).filter(
    (g) => g.cards.length > 0,
  );
}
