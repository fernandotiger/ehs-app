import { BarChart3, BookOpenCheck, ClipboardCheck, ClipboardList, FilePlus2, FileStack, FileText, Gauge, Inbox, LayoutDashboard, Library, ListChecks, ListTodo, MapPinned, Scale, Settings, ShieldAlert, ShieldCheck, SlidersHorizontal, SquareCheckBig, SquarePen, SquarePlus, Star, Target, TriangleAlert, type LucideIcon } from "lucide-react";
import { CONFIGURATION_PERMISSIONS } from "@/features/configuration/hub-cards";
import type { ModuleKey } from "@/lib/modules";
import { PERMISSIONS, type Permission } from "@/lib/permissions";

export interface NavItem {
  title: string;
  href: string;
  icon: LucideIcon;
  /** Visible when the user has ANY of these permissions (omit = everyone). */
  permissions?: readonly Permission[];
}

export interface NavSection {
  key: string;
  title: string;
  icon: LucideIcon;
  /** Shown only when the tenant has enabled this module (omit = platform section). */
  module?: ModuleKey;
  items: NavItem[];
}

export interface NavUser {
  permissions: readonly Permission[];
  enabledModules: readonly ModuleKey[];
}

/** Always-visible entries above the module sections. */
export const TOP_ITEMS: NavItem[] = [
  { title: "Home", href: "/dashboard", icon: LayoutDashboard },
  { title: "My work", href: "/my-work", icon: Inbox },
  // Personal shortcuts to search / create pages and websites (platform feature: no module, no permission).
  { title: "Favourites", href: "/favourites", icon: Star },
];

/**
 * One collapsible section per module (≤6 items each) plus Configuration. Modules add their
 * section here with `module: "<key>"` so it disappears when the tenant has not enabled it.
 */
export const NAV_SECTIONS: NavSection[] = [
  {
    key: "documents",
    title: "Documents",
    icon: FileText,
    module: "documents",
    items: [
      { title: "My Documents", href: "/documents", icon: BookOpenCheck },
      { title: "Document Library", href: "/documents/manage", icon: FileStack, permissions: [PERMISSIONS.DOCUMENTS_MANAGE, PERMISSIONS.DOCUMENTS_ACK_REPORTS] },
      // Document surveys are shown to people as "Employee Induction" (owner's decision, 28 Oct 2026; routes keep "surveys"):
      // My Inductions (to complete) · Induction Library (manage) · Create induction.
      { title: "My Inductions", href: "/documents/surveys", icon: ClipboardList },
      { title: "Induction Library", href: "/documents/surveys/library", icon: ClipboardCheck, permissions: [PERMISSIONS.DOCUMENTS_MANAGE, PERMISSIONS.DOCUMENTS_ACK_REPORTS] },
      { title: "Create induction", href: "/documents/surveys/new", icon: SquarePen, permissions: [PERMISSIONS.DOCUMENTS_MANAGE] },
    ],
  },
  {
    key: "incidents",
    title: "Incidents",
    icon: TriangleAlert,
    module: "incidents",
    // Investigations and Tasks are tabs of the Incidents and Actions registers; Trends & prevention is a tab of Reports.
    items: [
      { title: "Overview", href: "/incidents", icon: ShieldAlert },
      { title: "Report incident", href: "/incidents/new", icon: FilePlus2, permissions: [PERMISSIONS.INCIDENT_CREATE] },
      { title: "Incidents", href: "/incidents/register", icon: TriangleAlert },
      { title: "Actions", href: "/incidents/actions", icon: ListChecks },
      { title: "Reports", href: "/incidents/reports", icon: BarChart3, permissions: [PERMISSIONS.INCIDENT_VIEW, PERMISSIONS.INCIDENT_ACTION_VIEW] },
    ],
  },
  {
    key: "risk",
    title: "Risk",
    icon: ShieldCheck,
    module: "risk",
    // Objectives, Targets and Programmes share one page with tabs; the Risk matrix / scoring rules screen
    // lives in Configuration (/configuration/risk) – the spec lists them as separate menu entries.
    items: [
      { title: "Overview", href: "/risk", icon: Gauge },
      { title: "Assessments", href: "/risk/assessments", icon: ClipboardList },
      { title: "Objectives & programmes", href: "/risk/strategy", icon: Target, permissions: [PERMISSIONS.RISK_VIEW, PERMISSIONS.RISK_CREATE] },
      { title: "Tasks", href: "/risk/tasks", icon: ListTodo },
      { title: "Reports", href: "/risk/reports", icon: BarChart3, permissions: [PERMISSIONS.RISK_VIEW, PERMISSIONS.RISK_TASK_VIEW] },
    ],
  },
  {
    key: "law",
    title: "Law",
    icon: Scale,
    module: "law",
    // The spec's Legislation, Compliance checklists, Other requirements and Changes & updates are folded into
    // "Laws that apply to us" (company requirements live there), the Law library and the profile pages;
    // installing content packages lives in Configuration (/configuration/law).
    items: [
      { title: "Overview", href: "/law", icon: Gauge },
      { title: "Laws that apply to us", href: "/law/requirements", icon: ClipboardCheck },
      { title: "Tasks", href: "/law/tasks", icon: ListTodo },
      { title: "Law library", href: "/law/library", icon: Library },
      { title: "Profiles", href: "/law/profiles", icon: MapPinned },
      { title: "Reports", href: "/law/reports", icon: BarChart3, permissions: [PERMISSIONS.LAW_VIEW] },
    ],
  },
  {
    // The boss's storyboard version of Law, kept separate so either module can be removed. Its customisation lives
    // in its own "Configuration" item (owner's rule, 28 Oct 2026) – the platform Configuration hub is not touched.
    // "Actions to do" has no permission: everyone sees the actions they own there.
    key: "simplified-law",
    title: "Simplified law",
    icon: Scale,
    module: "simplified-law",
    items: [
      { title: "Overview", href: "/simplified-law", icon: Gauge, permissions: [PERMISSIONS.SLAW_VIEW, PERMISSIONS.SLAW_ASSESS, PERMISSIONS.SLAW_MANAGE] },
      { title: "All legislation", href: "/simplified-law/legislation", icon: Library, permissions: [PERMISSIONS.SLAW_VIEW, PERMISSIONS.SLAW_ASSESS, PERMISSIONS.SLAW_MANAGE] },
      { title: "Actions to do", href: "/simplified-law/actions", icon: ListTodo },
      { title: "Configuration", href: "/simplified-law/configuration", icon: SlidersHorizontal, permissions: [PERMISSIONS.SLAW_MANAGE] },
    ],
  },
  {
    // Standalone actions (not linked to an incident or a risk), placed just before Configuration (owner's request, 28 Oct 2026).
    key: "actions",
    title: "Actions",
    icon: SquareCheckBig,
    module: "actions",
    items: [
      { title: "My Actions", href: "/actions", icon: ListTodo },
      { title: "Create Action", href: "/actions/new", icon: SquarePlus, permissions: [PERMISSIONS.ACTION_CREATE] },
    ],
  },
  {
    key: "configuration",
    title: "Configuration",
    icon: Settings,
    items: [{ title: "Configuration", href: "/configuration", icon: Settings, permissions: CONFIGURATION_PERMISSIONS }],
  },
];

export function visibleItems(items: NavItem[], permissions: readonly Permission[]): NavItem[] {
  return items.filter((i) => !i.permissions || i.permissions.some((p) => permissions.includes(p)));
}

/** Sections the user can see (module enabled + at least one permitted item), items filtered. */
export function visibleSections(user: NavUser): NavSection[] {
  return NAV_SECTIONS.filter((s) => !s.module || user.enabledModules.includes(s.module))
    .map((s) => ({ ...s, items: visibleItems(s.items, user.permissions) }))
    .filter((s) => s.items.length > 0);
}

/**
 * The active item is the one whose href is the longest prefix of the current path,
 * so "/documents/abc" highlights My Documents while "/documents/manage/x" highlights
 * Document Library.
 */
export function findActiveHref(pathname: string, items: NavItem[]): string | null {
  let best: string | null = null;
  for (const item of items) {
    if (pathname === item.href || pathname.startsWith(item.href + "/")) {
      if (!best || item.href.length > best.length) best = item.href;
    }
  }
  return best;
}

/** The parts of a click on a menu link that decide whether the page on the right changes. */
export interface NavClick {
  button: number;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  defaultPrevented: boolean;
}

/**
 * A plain left click on a link to another page (not opened in a new tab or window, not the page
 * already shown). On desktop such a click folds the sidebar to its icon strip (owner's choice).
 */
export function changesPage(click: NavClick, href: string, pathname: string): boolean {
  if (click.defaultPrevented || click.button !== 0) return false;
  if (click.metaKey || click.ctrlKey || click.shiftKey || click.altKey) return false;
  return href !== pathname;
}

export function allNavItems(user: NavUser): NavItem[] {
  return [...TOP_ITEMS, ...visibleSections(user).flatMap((s) => s.items)];
}
