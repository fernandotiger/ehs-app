/**
 * Permission catalogue – the single source of truth for fine-grained access.
 *
 * Roles are tenant data (Configuration → Roles & permissions) and hold a list of these keys.
 * A role is granted to a person through a *scoped assignment* (whole company, business unit,
 * site, location or department), so the same role can apply to one site only.
 * Code only ever checks permissions, never role names. Safe to import on client and server.
 */
import type { ModuleKey } from "./modules";

export const PERMISSIONS = {
  // Documents
  DOCUMENTS_MANAGE: "document.manage",
  DOCUMENTS_VIEW_ALL: "document.view_all",
  DOCUMENTS_ACK_REPORTS: "document.ack_reports",

  // Incident
  INCIDENT_VIEW: "incident.view",
  INCIDENT_CREATE: "incident.create",
  INCIDENT_TRIAGE: "incident.triage",
  INCIDENT_INVESTIGATE: "incident.investigate",
  INCIDENT_CLOSE: "incident.close",
  INCIDENT_VIEW_CONFIDENTIAL: "incident.view_confidential",
  INCIDENT_ACTION_VIEW: "incident.action.view",
  INCIDENT_ACTION_CREATE: "incident.action.create",
  INCIDENT_ACTION_ASSIGN: "incident.action.assign",
  INCIDENT_ACTION_COMPLETE: "incident.action.complete",
  INCIDENT_ACTION_VERIFY: "incident.action.verify",
  INCIDENT_RECURRING_MANAGE: "incident.recurring.manage",
  INCIDENT_CONFIGURE: "incident.configure",

  // Risk
  RISK_VIEW: "risk.view",
  RISK_CREATE: "risk.create",
  RISK_EDIT: "risk.edit",
  RISK_APPROVE: "risk.approve",
  RISK_TASK_VIEW: "risk.task.view",
  RISK_TASK_CREATE: "risk.task.create",
  RISK_TASK_ASSIGN: "risk.task.assign",
  RISK_TASK_COMPLETE: "risk.task.complete",
  RISK_TASK_VERIFY: "risk.task.verify",
  RISK_CONFIGURE: "risk.configure",

  // Audit
  AUDIT_VIEW: "audit.view",
  AUDIT_SCHEDULE: "audit.schedule",
  AUDIT_CREATE: "audit.create",
  AUDIT_CONDUCT: "audit.conduct",
  AUDIT_FINDING_MANAGE: "audit.finding.manage",
  AUDIT_REPORT_PUBLISH: "audit.report.publish",
  AUDIT_CLOSE: "audit.close",
  AUDIT_CONFIGURE: "audit.configure",

  // Inspection
  INSPECTION_VIEW: "inspection.view",
  INSPECTION_SCHEDULE: "inspection.schedule",
  INSPECTION_CONDUCT: "inspection.conduct",
  INSPECTION_COMPLETE: "inspection.complete",
  INSPECTION_FOLLOWUP: "inspection.followup",
  INSPECTION_ARCHIVE: "inspection.archive",
  INSPECTION_EXPORT: "inspection.export",

  // Law
  LAW_VIEW: "law.view",
  LAW_REQUIREMENT_MANAGE: "law.requirement.manage",
  LAW_EVALUATION_CREATE: "law.evaluation.create",
  LAW_EVALUATION_APPROVE: "law.evaluation.approve",

  // Form Builder
  FORMS_VIEW: "forms.view",
  FORMS_DESIGN: "forms.design",
  FORMS_PUBLISH: "forms.publish",
  FORMS_ARCHIVE: "forms.archive",

  // Configuration (kept as ADMIN_* names for existing call sites)
  ADMIN_ORGANISATION: "config.structure.manage",
  ADMIN_USERS: "config.users.manage",
  ADMIN_ROLES: "config.roles.manage",
  CONFIG_BULK_IMPORT: "config.bulk_import",
  CONFIG_BRANDING: "config.branding.manage",
  CONFIG_LISTS: "config.lists.manage",
  CONFIG_SUBSCRIPTION: "config.subscription.manage",
  CONFIG_JOBS_VIEW: "config.jobs.view",
  CONFIG_JOBS_MANAGE: "config.jobs.manage",
  CONFIG_JOBS_TEST: "config.jobs.test",
  ADMIN_SETTINGS: "config.settings.manage",
  ADMIN_AUDIT: "config.audit.view",
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export type PermissionGroupKey = ModuleKey | "forms" | "configuration";

export interface PermissionDescriptor {
  key: Permission;
  label: string;
  description: string;
}

export interface PermissionGroup {
  key: PermissionGroupKey;
  title: string;
  description: string;
  permissions: PermissionDescriptor[];
}

const P = PERMISSIONS;

export const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    key: "risk",
    title: "Risk",
    description: "Assessments and the tasks that control risks.",
    permissions: [
      { key: P.RISK_VIEW, label: "View risks", description: "Open risk assessments, objectives and programmes in scope." },
      { key: P.RISK_CREATE, label: "Create risks", description: "Start new risk assessments." },
      { key: P.RISK_EDIT, label: "Edit risks", description: "Change assessments, scoring and controls." },
      { key: P.RISK_APPROVE, label: "Approve risks", description: "Approve assessments and confirm periodic reviews." },
      { key: P.RISK_TASK_VIEW, label: "View tasks", description: "See risk tasks in scope." },
      { key: P.RISK_TASK_CREATE, label: "Create tasks", description: "Raise improvement tasks." },
      { key: P.RISK_TASK_ASSIGN, label: "Assign tasks", description: "Choose or change task owners." },
      { key: P.RISK_TASK_COMPLETE, label: "Complete assigned tasks", description: "Mark their own tasks complete." },
      { key: P.RISK_TASK_VERIFY, label: "Verify completed tasks", description: "Confirm completed tasks were effective." },
      { key: P.RISK_CONFIGURE, label: "Configure risk", description: "Risk matrix, scoring rules and review periods." },
    ],
  },
  {
    key: "incidents",
    title: "Incident",
    description: "Reports, investigations and corrective actions.",
    permissions: [
      { key: P.INCIDENT_VIEW, label: "View incidents", description: "See incidents in scope (everyone sees their own reports)." },
      { key: P.INCIDENT_CREATE, label: "Report incidents", description: "Record new incidents and save drafts." },
      { key: P.INCIDENT_TRIAGE, label: "Triage incidents", description: "Review new reports, set severity and assign investigators." },
      { key: P.INCIDENT_INVESTIGATE, label: "Investigate incidents", description: "Record investigations, causes, losses and impacts." },
      { key: P.INCIDENT_CLOSE, label: "Close or reopen incidents", description: "Close incidents once the gates are met, or reopen them." },
      { key: P.INCIDENT_VIEW_CONFIDENTIAL, label: "View confidential details", description: "See people and narratives on confidential incidents." },
      { key: P.INCIDENT_ACTION_VIEW, label: "View actions", description: "See corrective and preventive actions in scope." },
      { key: P.INCIDENT_ACTION_CREATE, label: "Create actions", description: "Raise corrective and preventive actions." },
      { key: P.INCIDENT_ACTION_ASSIGN, label: "Assign actions", description: "Choose or change action owners." },
      { key: P.INCIDENT_ACTION_COMPLETE, label: "Complete assigned actions", description: "Complete their own actions and child tasks." },
      { key: P.INCIDENT_ACTION_VERIFY, label: "Verify completed actions", description: "Record whether completed actions were effective." },
      { key: P.INCIDENT_RECURRING_MANAGE, label: "Manage recurring actions", description: "Reserved for recurring actions (no screen yet)." },
      { key: P.INCIDENT_CONFIGURE, label: "Configure incidents", description: "Incident types, subtypes, forms and settings." },
    ],
  },
  {
    key: "audits",
    title: "Audit",
    description: "Scheduled audits, findings and reports.",
    permissions: [
      { key: P.AUDIT_VIEW, label: "View audits", description: "See audits, plans and findings in scope." },
      { key: P.AUDIT_SCHEDULE, label: "Schedule audits", description: "Plan programmes and schedule audits." },
      { key: P.AUDIT_CREATE, label: "Create audits", description: "Create audits and recurring schedules." },
      { key: P.AUDIT_CONDUCT, label: "Conduct audits", description: "Answer audit questionnaires." },
      { key: P.AUDIT_FINDING_MANAGE, label: "Record findings & evidence", description: "Classify findings and route follow-up." },
      { key: P.AUDIT_REPORT_PUBLISH, label: "Publish reports", description: "Publish audit reports." },
      { key: P.AUDIT_CLOSE, label: "Close audits", description: "Complete and close audits." },
      { key: P.AUDIT_CONFIGURE, label: "Configure audits", description: "Audit settings and finding types." },
    ],
  },
  {
    key: "inspections",
    title: "Inspection",
    description: "Routine workplace and equipment checks with connected follow-up.",
    permissions: [
      { key: P.INSPECTION_VIEW, label: "View inspections & findings", description: "See inspections in scope." },
      { key: P.INSPECTION_SCHEDULE, label: "Schedule inspections", description: "Schedule one-off and repeat inspections." },
      { key: P.INSPECTION_CONDUCT, label: "Record checks & evidence", description: "Answer checklists and attach evidence." },
      { key: P.INSPECTION_COMPLETE, label: "Complete inspections", description: "Complete inspections." },
      { key: P.INSPECTION_FOLLOWUP, label: "Raise actions & incident drafts", description: "Route findings to Incident." },
      { key: P.INSPECTION_ARCHIVE, label: "Archive & restore inspections", description: "Archive or restore inspections." },
      { key: P.INSPECTION_EXPORT, label: "Export inspection reports", description: "Export inspection reports." },
    ],
  },
  {
    key: "documents",
    title: "Document",
    description: "Controlled documents, audiences and acknowledgements.",
    permissions: [
      { key: P.DOCUMENTS_MANAGE, label: "Manage documents", description: "Upload documents, publish versions, set audiences and acknowledgement rules." },
      { key: P.DOCUMENTS_VIEW_ALL, label: "View all documents", description: "Open any document regardless of its audience." },
      { key: P.DOCUMENTS_ACK_REPORTS, label: "Acknowledgement reports", description: "See who acknowledged documents and export the audit trail." },
    ],
  },
  {
    key: "law",
    title: "Law",
    description: "Requirements, obligations and compliance evaluations.",
    permissions: [
      { key: P.LAW_VIEW, label: "View requirements", description: "See legal profiles, registers and evaluations." },
      { key: P.LAW_REQUIREMENT_MANAGE, label: "Manage requirements", description: "Maintain profiles, registers, other requirements and updates." },
      { key: P.LAW_EVALUATION_CREATE, label: "Create evaluations", description: "Evaluate relevance and compliance." },
      { key: P.LAW_EVALUATION_APPROVE, label: "Approve evaluations", description: "Approve compliance evaluations." },
    ],
  },
  {
    key: "forms",
    title: "Form Builder",
    description: "One form library used by incidents, risks, audits and inspections.",
    permissions: [
      { key: P.FORMS_VIEW, label: "View form designs", description: "Browse and preview forms." },
      { key: P.FORMS_DESIGN, label: "Create & edit draft forms", description: "Design draft forms." },
      { key: P.FORMS_PUBLISH, label: "Publish form versions", description: "Publish new form versions." },
      { key: P.FORMS_ARCHIVE, label: "Archive forms", description: "Reserved (no archive screen yet)." },
    ],
  },
  {
    key: "configuration",
    title: "Configuration",
    description: "Company administration and customisation.",
    permissions: [
      { key: P.ADMIN_ORGANISATION, label: "Manage company structure", description: "Business units, sites, locations and departments." },
      { key: P.ADMIN_USERS, label: "Manage users", description: "Add people, reset passwords, deactivate accounts." },
      { key: P.ADMIN_ROLES, label: "Manage roles & assignments", description: "Create roles, choose permissions and assign scopes." },
      { key: P.CONFIG_BULK_IMPORT, label: "Run bulk import", description: "Import company configuration from CSV." },
      { key: P.CONFIG_BRANDING, label: "Change branding", description: "Logo and colours." },
      { key: P.CONFIG_LISTS, label: "Manage lists & numbering", description: "Pick-lists, categories, templates and reference numbers." },
      { key: P.CONFIG_SUBSCRIPTION, label: "Manage subscription", description: "See plan and enabled modules." },
      { key: P.CONFIG_JOBS_VIEW, label: "View scheduled jobs & run history", description: "See reminder jobs and their runs." },
      { key: P.CONFIG_JOBS_MANAGE, label: "Create, edit & pause scheduled jobs", description: "Maintain reminder jobs." },
      { key: P.CONFIG_JOBS_TEST, label: "Test scheduled jobs", description: "Test and run jobs manually." },
      { key: P.ADMIN_SETTINGS, label: "System settings", description: "Upload limits, time zone and other company settings." },
      { key: P.ADMIN_AUDIT, label: "View audit log", description: "Browse the company-wide audit log." },
    ],
  },
];

export const ALL_PERMISSIONS: Permission[] = PERMISSION_GROUPS.flatMap((g) => g.permissions.map((p) => p.key));

export function isPermission(value: string): value is Permission {
  return (ALL_PERMISSIONS as string[]).includes(value);
}

export function permissionLabel(key: string): string {
  for (const group of PERMISSION_GROUPS) {
    const found = group.permissions.find((p) => p.key === key);
    if (found) return `${group.title} · ${found.label}`;
  }
  return key;
}

/** Selecting a key also selects everything it requires (e.g. Publish → Design → View). */
export const PERMISSION_REQUIRES: Partial<Record<Permission, Permission[]>> = {
  [P.FORMS_DESIGN]: [P.FORMS_VIEW],
  [P.FORMS_PUBLISH]: [P.FORMS_DESIGN, P.FORMS_VIEW],
  [P.FORMS_ARCHIVE]: [P.FORMS_VIEW],
  [P.CONFIG_JOBS_MANAGE]: [P.CONFIG_JOBS_VIEW],
  [P.CONFIG_JOBS_TEST]: [P.CONFIG_JOBS_VIEW],
};

/**
 * Apply permission dependencies: adds required keys for every selected key, and (when a key
 * was just removed) drops keys that depend on it. Used by the role editor and the server.
 */
export function normalisePermissions(selected: readonly string[], removed?: string): Permission[] {
  const set = new Set(selected.filter(isPermission));
  if (removed) {
    let changed = true;
    set.delete(removed as Permission);
    while (changed) {
      changed = false;
      for (const key of [...set]) {
        if ((PERMISSION_REQUIRES[key] ?? []).some((r) => !set.has(r))) {
          set.delete(key);
          changed = true;
        }
      }
    }
    return ALL_PERMISSIONS.filter((p) => set.has(p));
  }
  for (const key of [...set]) for (const r of PERMISSION_REQUIRES[key] ?? []) set.add(r);
  return ALL_PERMISSIONS.filter((p) => set.has(p));
}

/** Well-known seeded role keys (roles themselves are editable tenant data). */
export const SYSTEM_ROLE_KEYS = {
  ADMINISTRATOR: "administrator",
  EMPLOYEE: "employee",
  MANAGER: "manager",
  HR_ADMIN: "hr-admin",
  EHS_MANAGER: "ehs-manager",
  EHS_INVESTIGATOR: "ehs-investigator",
  AUDITOR: "auditor",
  INSPECTOR: "inspector",
} as const;
