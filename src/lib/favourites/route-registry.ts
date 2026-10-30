import type { ModuleKey } from "@/lib/modules";
import { PERMISSIONS as P, type Permission } from "@/lib/permissions";
import type { IconName } from "./icon-names";

/**
 * Favourites route registry – one entry for EVERY page under `src/app/(app)` (a test checks it
 * against the file system). Pure: shared by the header star, the Favourites page and the API.
 *
 * - `kind`: only "search" and "create" pages can be favourites; everything else is "other" (Home,
 *   My work, overviews, record and edit pages, print / scan / redirect routes, every Configuration
 *   page, the Law module – owner's decision, 29 Oct 2026 – and Favourites itself).
 * - `module` / `permissions` mirror the page guard (`guardModulePage(module, ...permissions)`, any-of).
 *   Extra checks inside a page (company scope on some Configuration pages) are not repeated – those
 *   pages are never offered, and the page guard stays the real gate.
 * - `icon`: the page's menu icon (lucide canonical name), used as the tile's default icon.
 * - `tab`: the URL key that holds the selected tab and its labels (default title + tile chip).
 *   `default` is the tab shown when the key is absent (it adds no suffix or chip).
 * - `oneTimeParams`: query keys the page uses once (stripped when saving). When `previousStep` is set
 *   and one of them is present, the page needs an earlier step and can't be a favourite.
 * - `seed`: create pages whose typed values can be kept (capture key, see use-favourite-capture.ts).
 */

export type RouteKind = "search" | "create" | "other";

export const SEED_KEYS = ["incident.report", "action.create", "risk.assessment", "document.new", "survey.new"] as const;
export type SeedKey = (typeof SEED_KEYS)[number];

export interface RouteTab {
  key: string;
  default: string;
  labels: Record<string, string>;
}

export interface PreviousStep {
  /** Plain explanation shown in the info dialog. */
  reason: string;
  /** Where the user starts the earlier step (blocked tile: "Go to …"). */
  startHref?: string;
  /** The empty version of this page that can be a favourite instead. */
  plainAlternative?: string;
}

export interface RouteEntry {
  pattern: string;
  title: string;
  icon: IconName;
  module?: ModuleKey;
  permissions?: readonly Permission[];
  kind: RouteKind;
  tab?: RouteTab;
  oneTimeParams?: readonly string[];
  previousStep?: PreviousStep;
  seed?: SeedKey;
}

const DOCUMENT_LIBRARY = [P.DOCUMENTS_MANAGE, P.DOCUMENTS_VIEW_ALL, P.DOCUMENTS_ACK_REPORTS] as const;
const SLAW_REGISTER = [P.SLAW_VIEW, P.SLAW_ASSESS, P.SLAW_MANAGE] as const;
const MINE_ALL = { mine: "Mine", all: "Everyone's" };

export const ROUTES: readonly RouteEntry[] = [
  // ── Platform ──────────────────────────────────────────────────────────────
  { pattern: "/dashboard", title: "Home", icon: "LayoutDashboard", kind: "other" },
  { pattern: "/my-work", title: "My work", icon: "Inbox", kind: "other" },
  { pattern: "/favourites", title: "Favourites", icon: "Star", kind: "other" },

  // ── Documents ─────────────────────────────────────────────────────────────
  {
    pattern: "/documents", title: "My Documents", icon: "BookOpenCheck", module: "documents", kind: "search",
    tab: { key: "filter", default: "all", labels: { all: "All", action: "Action required", acknowledged: "Acknowledged" } },
  },
  { pattern: "/documents/[id]", title: "Document", icon: "FileText", module: "documents", kind: "other" },
  {
    pattern: "/documents/manage", title: "Document Library", icon: "FileStack", module: "documents", permissions: DOCUMENT_LIBRARY, kind: "search",
    tab: { key: "tab", default: "documents", labels: { documents: "Documents", forms: "Response forms" } },
  },
  {
    pattern: "/documents/manage/new", title: "Upload document", icon: "FileUp", module: "documents", permissions: [P.DOCUMENTS_MANAGE], kind: "create",
    seed: "document.new",
    oneTimeParams: ["uploadId", "title", "description"],
    previousStep: {
      reason: "This page was filled in by Save as document on a risk assessment. That file is only kept for 24 hours, so this page can't be a favourite.",
      startHref: "/risk/assessments",
      plainAlternative: "/documents/manage/new",
    },
  },
  { pattern: "/documents/manage/[id]", title: "Manage document", icon: "FileText", module: "documents", permissions: DOCUMENT_LIBRARY, kind: "other" },
  {
    pattern: "/documents/surveys", title: "My Response Forms", icon: "ClipboardList", module: "documents", kind: "search",
    tab: { key: "filter", default: "all", labels: { all: "All", todo: "To complete", answered: "Completed" } },
  },
  // Redirects to the Document Library's Response forms tab (30 Oct 2026). It stays "search" so favourites saved before
  // still open (the redirect keeps their filters); new ones are saved on /documents/manage?tab=forms.
  { pattern: "/documents/surveys/library", title: "Document Library – Response forms", icon: "ClipboardList", module: "documents", permissions: DOCUMENT_LIBRARY, kind: "search" },
  { pattern: "/documents/surveys/library/[id]", title: "Manage response form", icon: "ClipboardList", module: "documents", permissions: DOCUMENT_LIBRARY, kind: "other" },
  { pattern: "/documents/surveys/new", title: "Create response form", icon: "ClipboardCheck", module: "documents", permissions: [P.DOCUMENTS_MANAGE], kind: "create", seed: "survey.new" },

  // ── Incidents ─────────────────────────────────────────────────────────────
  { pattern: "/incidents", title: "Incidents overview", icon: "ShieldAlert", module: "incidents", kind: "other" },
  { pattern: "/incidents/new", title: "Report incident", icon: "FilePlusCorner", module: "incidents", permissions: [P.INCIDENT_CREATE], kind: "create", seed: "incident.report" },
  {
    pattern: "/incidents/register", title: "Incidents register", icon: "TriangleAlert", module: "incidents", kind: "search",
    tab: { key: "view", default: "incidents", labels: { incidents: "Incidents", investigations: "Investigations" } },
  },
  {
    pattern: "/incidents/actions", title: "Incident actions", icon: "ListChecks", module: "incidents", kind: "search",
    tab: { key: "view", default: "actions", labels: { actions: "Actions", tasks: "Tasks" } },
  },
  {
    pattern: "/incidents/reports", title: "Incident reports", icon: "ChartColumn", module: "incidents", permissions: [P.INCIDENT_VIEW, P.INCIDENT_ACTION_VIEW], kind: "search",
    tab: {
      key: "tab",
      default: "by-type",
      labels: { "by-type": "By type", "by-cause": "By cause", "days-lost": "Days lost", actions: "Actions & tasks", incidents: "Incident tracking", trends: "Trends & prevention" },
    },
  },
  { pattern: "/incidents/[id]", title: "Incident", icon: "TriangleAlert", module: "incidents", kind: "other" },
  { pattern: "/incidents/[id]/edit", title: "Edit incident", icon: "SquarePen", module: "incidents", kind: "other" },
  { pattern: "/incidents/actions/[id]", title: "Incident action", icon: "ListChecks", module: "incidents", kind: "other" },
  { pattern: "/incidents/actions/task/[id]", title: "Incident action task", icon: "ListChecks", module: "incidents", kind: "other" }, // redirect
  { pattern: "/incidents/investigation/[id]", title: "Investigation", icon: "FileSearch", module: "incidents", kind: "other" }, // redirect

  // ── Standalone actions ────────────────────────────────────────────────────
  {
    pattern: "/actions", title: "My Actions", icon: "ListTodo", module: "actions", kind: "search",
    tab: { key: "view", default: "mine", labels: { mine: "All mine", assigned: "Assigned to me", created: "Created by me", all: "Everyone's" } },
  },
  { pattern: "/actions/new", title: "Create Action", icon: "SquarePlus", module: "actions", permissions: [P.ACTION_CREATE], kind: "create", seed: "action.create" },
  { pattern: "/actions/[id]", title: "Action", icon: "SquareCheckBig", module: "actions", kind: "other" },

  // ── Risk ──────────────────────────────────────────────────────────────────
  { pattern: "/risk", title: "Risk overview", icon: "Gauge", module: "risk", kind: "other" },
  { pattern: "/risk/assessments", title: "Risk assessments", icon: "ClipboardList", module: "risk", kind: "search" },
  { pattern: "/risk/assessments/new", title: "New risk assessment", icon: "ClipboardPlus", module: "risk", permissions: [P.RISK_CREATE], kind: "create", seed: "risk.assessment" },
  { pattern: "/risk/assessments/[id]", title: "Risk assessment", icon: "ClipboardList", module: "risk", kind: "other" },
  { pattern: "/risk/assessments/[id]/edit", title: "Edit risk assessment", icon: "SquarePen", module: "risk", kind: "other" },
  { pattern: "/risk/assessments/[id]/print", title: "Print risk assessment", icon: "Printer", module: "risk", kind: "other" },
  { pattern: "/risk/tasks", title: "Risk tasks", icon: "ListTodo", module: "risk", kind: "search" },
  { pattern: "/risk/tasks/[id]", title: "Risk task", icon: "ListTodo", module: "risk", kind: "other" },
  {
    pattern: "/risk/strategy", title: "Objectives & programmes", icon: "Target", module: "risk", kind: "search",
    tab: { key: "tab", default: "objectives", labels: { objectives: "Objectives", targets: "Targets", programmes: "Programmes" } },
  },
  { pattern: "/risk/strategy/objectives/[id]", title: "Objective", icon: "Target", module: "risk", kind: "other" },
  { pattern: "/risk/strategy/targets/[id]", title: "Target", icon: "Target", module: "risk", kind: "other" },
  { pattern: "/risk/strategy/programmes/[id]", title: "Programme", icon: "Target", module: "risk", kind: "other" },
  {
    pattern: "/risk/reports", title: "Risk reports", icon: "ChartColumn", module: "risk", permissions: [P.RISK_VIEW, P.RISK_TASK_VIEW], kind: "search",
    tab: {
      key: "report",
      default: "by-department",
      labels: {
        "by-department": "By department",
        "by-hazard": "By hazard / aspect",
        "score-reductions": "Score reductions",
        "review-coverage": "Review coverage",
        "outstanding-strategy": "Outstanding objectives",
        "outstanding-tasks": "Outstanding tasks",
        "task-summary": "Task summary",
      },
    },
  },
  { pattern: "/scan", title: "Scan a QR code", icon: "ScanLine", module: "risk", kind: "other" },

  // ── Law (not part of Favourites – owner's decision, 29 Oct 2026) ──────────
  { pattern: "/law", title: "Law overview", icon: "Gauge", module: "law", kind: "other" },
  { pattern: "/law/requirements", title: "Laws that apply to us", icon: "ClipboardCheck", module: "law", kind: "other" },
  { pattern: "/law/requirements/[id]", title: "Requirement", icon: "ClipboardCheck", module: "law", kind: "other" },
  { pattern: "/law/tasks", title: "Law tasks", icon: "ListTodo", module: "law", kind: "other" },
  { pattern: "/law/tasks/[id]", title: "Law task", icon: "ListTodo", module: "law", kind: "other" },
  { pattern: "/law/library", title: "Law library", icon: "Library", module: "law", kind: "other" },
  { pattern: "/law/library/[id]", title: "Legislation", icon: "Library", module: "law", kind: "other" },
  { pattern: "/law/profiles", title: "Law profiles", icon: "MapPinned", module: "law", kind: "other" },
  { pattern: "/law/profiles/[id]", title: "Law profile", icon: "MapPinned", module: "law", kind: "other" },
  { pattern: "/law/reports", title: "Law reports", icon: "ChartColumn", module: "law", permissions: [P.LAW_VIEW], kind: "other" },

  // ── Simplified law ────────────────────────────────────────────────────────
  { pattern: "/simplified-law", title: "Simplified law overview", icon: "Gauge", module: "simplified-law", permissions: SLAW_REGISTER, kind: "other" },
  { pattern: "/simplified-law/legislation", title: "All legislation", icon: "Library", module: "simplified-law", permissions: SLAW_REGISTER, kind: "search" },
  { pattern: "/simplified-law/legislation/[id]", title: "Legislation", icon: "Library", module: "simplified-law", permissions: SLAW_REGISTER, kind: "other" },
  {
    pattern: "/simplified-law/actions", title: "Actions to do", icon: "ListTodo", module: "simplified-law", kind: "search",
    tab: { key: "view", default: "mine", labels: MINE_ALL },
    oneTimeParams: ["open"],
  },
  { pattern: "/simplified-law/configuration", title: "Simplified law configuration", icon: "SlidersHorizontal", module: "simplified-law", permissions: [P.SLAW_MANAGE], kind: "other" },
  { pattern: "/simplified-law/configuration/legislation/new", title: "Add legislation", icon: "SlidersHorizontal", module: "simplified-law", permissions: [P.SLAW_MANAGE], kind: "other" },
  { pattern: "/simplified-law/configuration/legislation/[id]", title: "Edit legislation", icon: "SlidersHorizontal", module: "simplified-law", permissions: [P.SLAW_MANAGE], kind: "other" },

  // ── Configuration (never offered) ─────────────────────────────────────────
  // The hub's guard takes any configuration permission (CONFIGURATION_PERMISSIONS in hub-cards.ts); it is not
  // repeated here to keep this file free of UI imports – the page is never offered.
  { pattern: "/configuration", title: "Configuration", icon: "Settings", kind: "other" },
  { pattern: "/configuration/audit-log", title: "Audit log", icon: "Settings", permissions: [P.ADMIN_AUDIT], kind: "other" },
  { pattern: "/configuration/branding", title: "Branding", icon: "Settings", permissions: [P.CONFIG_BRANDING], kind: "other" },
  { pattern: "/configuration/forms", title: "Form Builder", icon: "Settings", permissions: [P.FORMS_VIEW, P.FORMS_DESIGN, P.FORMS_PUBLISH], kind: "other" },
  { pattern: "/configuration/forms/[id]", title: "Form designer", icon: "Settings", permissions: [P.FORMS_VIEW, P.FORMS_DESIGN, P.FORMS_PUBLISH], kind: "other" },
  { pattern: "/configuration/import", title: "Import", icon: "Settings", permissions: [P.CONFIG_BULK_IMPORT], kind: "other" },
  { pattern: "/configuration/incidents", title: "Incident settings", icon: "Settings", module: "incidents", permissions: [P.INCIDENT_CONFIGURE], kind: "other" },
  { pattern: "/configuration/jobs", title: "Scheduled jobs", icon: "Settings", permissions: [P.CONFIG_JOBS_VIEW, P.CONFIG_JOBS_MANAGE, P.CONFIG_JOBS_TEST], kind: "other" },
  { pattern: "/configuration/law", title: "Law content & settings", icon: "Settings", module: "law", permissions: [P.LAW_REQUIREMENT_MANAGE, P.INCIDENT_CONFIGURE], kind: "other" },
  { pattern: "/configuration/lists", title: "Lists", icon: "Settings", permissions: [P.CONFIG_LISTS], kind: "other" },
  { pattern: "/configuration/numbering", title: "Numbering", icon: "Settings", permissions: [P.CONFIG_LISTS], kind: "other" },
  { pattern: "/configuration/risk", title: "Risk matrix", icon: "Settings", module: "risk", permissions: [P.RISK_CONFIGURE, P.FORMS_PUBLISH], kind: "other" },
  { pattern: "/configuration/roles", title: "Roles", icon: "Settings", permissions: [P.ADMIN_ROLES], kind: "other" },
  { pattern: "/configuration/settings", title: "System settings", icon: "Settings", permissions: [P.ADMIN_SETTINGS], kind: "other" },
  { pattern: "/configuration/structure", title: "Company structure", icon: "Settings", permissions: [P.ADMIN_ORGANISATION], kind: "other" },
  { pattern: "/configuration/subscription", title: "Subscription", icon: "Settings", permissions: [P.CONFIG_SUBSCRIPTION], kind: "other" },
  { pattern: "/configuration/users", title: "Users", icon: "Settings", permissions: [P.ADMIN_USERS], kind: "other" },
];

/** Search and create pages – the ones the star is shown on. */
export function isOffered(entry: RouteEntry | null | undefined): entry is RouteEntry {
  return Boolean(entry && entry.kind !== "other");
}
