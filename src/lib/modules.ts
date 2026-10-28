/**
 * Business modules a tenant can subscribe to. Platform areas (Home, My work, Form Builder,
 * Scheduled jobs, Configuration) are always available and are not listed here.
 * Organization.enabledModules holds the keys enabled for a tenant.
 */
export const MODULE_KEYS = ["documents", "incidents", "risk", "actions", "audits", "inspections", "law"] as const;

export type ModuleKey = (typeof MODULE_KEYS)[number];

export interface ModuleDescriptor {
  key: ModuleKey;
  name: string;
  description: string;
  basePath: string;
  /** Record types the module contributes (used by Form Builder, links and reminders). */
  entityTypes: string[];
}

export const MODULES: Record<ModuleKey, ModuleDescriptor> = {
  documents: {
    key: "documents",
    name: "Documents",
    description: "Controlled documents, audiences and read-and-understood acknowledgements.",
    basePath: "/documents",
    entityTypes: ["Document"],
  },
  incidents: {
    key: "incidents",
    name: "Incidents",
    description: "Report incidents, investigate causes and track corrective and preventive actions.",
    basePath: "/incidents",
    entityTypes: ["Incident", "CorrectiveAction"],
  },
  risk: {
    key: "risk",
    name: "Risk",
    description: "Risk assessments, scoring, objectives, programmes, tasks and periodic reviews.",
    basePath: "/risk",
    entityTypes: ["RiskAssessment", "RiskTask"],
  },
  actions: {
    key: "actions",
    name: "Actions",
    description: "Standalone actions not linked to an incident or a risk: who does what, by when.",
    basePath: "/actions",
    entityTypes: ["Action"],
  },
  audits: {
    key: "audits",
    name: "Audits",
    description: "Audit plans, programmes, scored audits, findings and recurring schedules.",
    basePath: "/audits",
    entityTypes: ["Audit", "AuditFinding"],
  },
  inspections: {
    key: "inspections",
    name: "Inspections",
    description: "Workplace and equipment checklists, findings and repeat inspections.",
    basePath: "/inspections",
    entityTypes: ["Inspection"],
  },
  law: {
    key: "law",
    name: "Law",
    description: "Legal profiles, registers, compliance evaluations and requirement updates.",
    basePath: "/law",
    entityTypes: ["LawProfile", "LawRequirement", "LawTask"],
  },
};

export function isModuleKey(value: string): value is ModuleKey {
  return (MODULE_KEYS as readonly string[]).includes(value);
}
