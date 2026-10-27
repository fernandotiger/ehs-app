import "server-only";
import type { ModuleKey } from "@/lib/modules";
import { prisma } from "@/server/db/client";

/**
 * Per-module record counts for Home → Insights. Each module adds ONE entry (current, not
 * archived records). Only modules the tenant has enabled are counted.
 */
export interface ModuleRecordCounter {
  module: ModuleKey;
  /** e.g. "Documents" */
  label: string;
  /** Short description of what is counted, e.g. "published and draft". */
  hint: string;
  href: string;
  count: () => Promise<number>;
}

export const MODULE_RECORD_COUNTERS: ModuleRecordCounter[] = [
  {
    module: "documents",
    label: "Documents",
    hint: "published and draft",
    href: "/documents/manage",
    count: () => prisma.document.count({ where: { status: { not: "ARCHIVED" } } }),
  },
  {
    module: "incidents",
    label: "Incidents",
    hint: "reported, not archived",
    href: "/incidents/register",
    count: () => prisma.incident.count({ where: { archivedAt: null, isDraft: false } }),
  },
  {
    module: "risk",
    label: "Risk assessments",
    hint: "not archived",
    href: "/risk/assessments",
    count: () => prisma.riskAssessment.count({ where: { status: { not: "ARCHIVED" } } }),
  },
];
