import { ALL_PERMISSIONS, normalisePermissions, PERMISSIONS, SYSTEM_ROLE_KEYS, type Permission } from "./permissions";

/**
 * Roles created for every new tenant (src/server/tenancy/provisioning.ts). They are ordinary
 * tenant data afterwards: administrators can rename them and change their permissions.
 * Code never checks role names – only permissions.
 */
export interface DefaultRole {
  key: string;
  name: string;
  description: string;
  permissions: Permission[];
}

const P = PERMISSIONS;

const EMPLOYEE: Permission[] = [P.INCIDENT_CREATE, P.INCIDENT_ACTION_COMPLETE, P.RISK_TASK_COMPLETE, P.ACTION_CREATE];

const MANAGER: Permission[] = [
  ...EMPLOYEE,
  P.INCIDENT_VIEW,
  P.INCIDENT_ACTION_VIEW,
  P.INCIDENT_ACTION_CREATE,
  P.INCIDENT_ACTION_ASSIGN,
  P.RISK_VIEW,
  P.RISK_TASK_VIEW,
  P.RISK_TASK_ASSIGN,
  P.ACTION_VIEW,
  P.ACTION_MANAGE,
  P.AUDIT_VIEW,
  P.INSPECTION_VIEW,
  P.LAW_VIEW,
  P.SLAW_VIEW,
  P.DOCUMENTS_ACK_REPORTS,
];

const EHS_MANAGER: Permission[] = [
  ...MANAGER,
  P.INCIDENT_TRIAGE,
  P.INCIDENT_INVESTIGATE,
  P.INCIDENT_CLOSE,
  P.INCIDENT_VIEW_CONFIDENTIAL,
  P.INCIDENT_ACTION_VERIFY,
  P.INCIDENT_RECURRING_MANAGE,
  P.INCIDENT_CONFIGURE,
  P.RISK_CREATE,
  P.RISK_EDIT,
  P.RISK_APPROVE,
  P.RISK_TASK_CREATE,
  P.RISK_TASK_VERIFY,
  P.RISK_CONFIGURE,
  P.AUDIT_SCHEDULE,
  P.AUDIT_CREATE,
  P.AUDIT_FINDING_MANAGE,
  P.AUDIT_REPORT_PUBLISH,
  P.AUDIT_CLOSE,
  P.AUDIT_CONFIGURE,
  P.INSPECTION_SCHEDULE,
  P.INSPECTION_CONDUCT,
  P.INSPECTION_COMPLETE,
  P.INSPECTION_FOLLOWUP,
  P.INSPECTION_ARCHIVE,
  P.INSPECTION_EXPORT,
  P.LAW_REQUIREMENT_MANAGE,
  P.LAW_EVALUATION_CREATE,
  P.LAW_EVALUATION_APPROVE,
  P.SLAW_ASSESS,
  P.SLAW_MANAGE,
  P.FORMS_PUBLISH,
  P.CONFIG_JOBS_VIEW,
];

export const DEFAULT_ROLES: DefaultRole[] = [
  {
    key: SYSTEM_ROLE_KEYS.ADMINISTRATOR,
    name: "Administrator",
    description: "Full access to every module and to Configuration.",
    permissions: ALL_PERMISSIONS,
  },
  {
    key: SYSTEM_ROLE_KEYS.EMPLOYEE,
    name: "Employee",
    description: "Baseline access: My work, My Documents, report incidents and complete assigned actions.",
    permissions: EMPLOYEE,
  },
  {
    key: SYSTEM_ROLE_KEYS.MANAGER,
    name: "Manager",
    description: "People and area managers: see work in their scope, assign actions, receive escalations.",
    permissions: MANAGER,
  },
  {
    key: SYSTEM_ROLE_KEYS.HR_ADMIN,
    name: "HR Admin",
    description: "Publishes policies, manages audiences and tracks acknowledgements; maintains the user directory.",
    permissions: [...EMPLOYEE, P.DOCUMENTS_MANAGE, P.DOCUMENTS_VIEW_ALL, P.DOCUMENTS_ACK_REPORTS, P.ADMIN_USERS],
  },
  {
    key: SYSTEM_ROLE_KEYS.EHS_MANAGER,
    name: "EHS Manager",
    description: "Runs the EHS programme: incidents, risk, audits, inspections, law and their forms.",
    permissions: EHS_MANAGER,
  },
  {
    key: SYSTEM_ROLE_KEYS.EHS_INVESTIGATOR,
    name: "EHS Investigator",
    description: "Investigates incidents, records causes and raises corrective actions.",
    permissions: [
      ...EMPLOYEE,
      P.INCIDENT_VIEW,
      P.INCIDENT_INVESTIGATE,
      P.INCIDENT_VIEW_CONFIDENTIAL,
      P.INCIDENT_ACTION_VIEW,
      P.INCIDENT_ACTION_CREATE,
      P.INCIDENT_ACTION_ASSIGN,
    ],
  },
  {
    key: SYSTEM_ROLE_KEYS.AUDITOR,
    name: "Auditor",
    description: "Plans and conducts audits, records findings and publishes reports.",
    permissions: [
      ...EMPLOYEE,
      P.AUDIT_VIEW,
      P.AUDIT_SCHEDULE,
      P.AUDIT_CREATE,
      P.AUDIT_CONDUCT,
      P.AUDIT_FINDING_MANAGE,
      P.AUDIT_REPORT_PUBLISH,
      P.AUDIT_CLOSE,
      P.INCIDENT_ACTION_VIEW,
    ],
  },
  {
    key: SYSTEM_ROLE_KEYS.INSPECTOR,
    name: "Inspector",
    description: "Carries out workplace and equipment inspections and raises follow-up.",
    permissions: [
      ...EMPLOYEE,
      P.INSPECTION_VIEW,
      P.INSPECTION_SCHEDULE,
      P.INSPECTION_CONDUCT,
      P.INSPECTION_COMPLETE,
      P.INSPECTION_FOLLOWUP,
      P.INSPECTION_EXPORT,
    ],
  },
].map((role) => ({ ...role, permissions: normalisePermissions(role.permissions) }));
