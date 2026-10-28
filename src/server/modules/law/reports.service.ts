import "server-only";
import { EVALUATION_STATUS_LABELS, LAW_DISCLAIMER, LAW_LINK_TARGET_LABELS, LAW_TASK_PRIORITY_LABELS, LAW_TASK_STATUS_LABELS, isLawTaskOverdue, type LawLinkTarget } from "@/lib/law";
import type { LawReportKey, LawReportQuery } from "@/lib/validation/law";
import type { CurrentUser } from "@/server/auth/current-user";
import { prisma } from "@/server/db/client";
import { describeEntity } from "@/server/modules/entities/registry";
import { followUpStatus } from "@/server/modules/incidents/follow-up.service";
import { csvName, csvResponse } from "@/server/modules/incidents/support";
import { profileVisibleWhere, requirementVisibleWhere, taskVisibleWhere } from "./law-access.policy";
import { evaluationFacts, rowInScope } from "./requirement-sync";
import { dateOnly, findVersion, loadNames, loadVersions, REQUIREMENT_ENTITY, todayFor } from "./support";
import { complianceSummary, evaluationStatus, isReviewOverdue, type ComplianceSummary } from "./workflow";

/**
 * Law reports for one profile (its accepted content), optionally narrowed to a register / category:
 * compliance register, task tracking, linked Risk & Incident work. JSON for the screen, CSV export.
 * Completion, rating and review attention stay separate columns – nothing claims verified compliance.
 */

export type LawReportCell = string | number | null;

export interface LawReportDto {
  key: LawReportKey;
  title: string;
  profile: { id: string; name: string; contentVersion: string } | null;
  columns: string[];
  rows: LawReportCell[][];
  summary: ComplianceSummary | null;
  note: string;
}

const TITLES: Record<LawReportKey, string> = {
  register: "Compliance register",
  tasks: "Task tracking",
  links: "Linked risk & incident work",
};

export const lawReportsService = {
  async run(user: CurrentUser, key: LawReportKey, q: LawReportQuery): Promise<LawReportDto | Response> {
    const report = await build(user, key, q);
    if (q.format === "csv") return csvResponse(csvName(`law-${key}`), [report.columns, ...report.rows]);
    return report;
  },
};

async function build(user: CurrentUser, key: LawReportKey, q: LawReportQuery): Promise<LawReportDto> {
  const today = todayFor(user.timeZone);
  const profiles = await prisma.lawProfile.findMany({ where: { AND: [profileVisibleWhere(user), { archivedAt: null }] }, orderBy: { name: "asc" } });
  const profile = (q.profileId ? profiles.find((p) => p.id === q.profileId) : profiles[0]) ?? null;
  const empty: LawReportDto = { key, title: TITLES[key], profile: null, columns: [], rows: [], summary: null, note: LAW_DISCLAIMER };
  if (!profile) return empty;
  const head = { key, title: TITLES[key], profile: { id: profile.id, name: profile.name, contentVersion: profile.contentVersion }, note: LAW_DISCLAIMER };
  const narrow = { ...(q.register ? { register: q.register } : {}), ...(q.category ? { category: q.category } : {}) };

  if (key === "tasks") {
    const tasks = await prisma.lawTask.findMany({
      where: { AND: [taskVisibleWhere(user), { profileId: profile.id }, Object.keys(narrow).length ? { requirement: narrow } : {}] },
      include: { requirement: { select: { reference: true, title: true, register: true, category: true } } },
      orderBy: [{ status: "asc" }, { dueDate: "asc" }],
    });
    const names = await loadNames(prisma, { users: tasks.map((t) => t.ownerId), departments: tasks.map((t) => t.departmentId) });
    return {
      ...head,
      columns: ["Task", "Description", "Requirement", "Register", "Status", "Priority", "Owner", "Department", "Due", "Overdue", "Completed", "Completion comment", "Archived"],
      rows: tasks.map((t) => {
        const due = dateOnly(t.dueDate)!;
        return [
          t.reference,
          t.title,
          `${t.requirement.reference} · ${t.requirement.title}`,
          t.requirement.register,
          LAW_TASK_STATUS_LABELS[t.status],
          LAW_TASK_PRIORITY_LABELS[t.priority],
          names.users.get(t.ownerId) ?? "",
          t.departmentId ? (names.departments.get(t.departmentId) ?? "") : "",
          due,
          !t.archivedAt && isLawTaskOverdue(t.status, due, today) ? "Yes" : "No",
          dateOnly(t.completedOn),
          t.completionNotes,
          t.archivedAt ? "Yes" : "No",
        ];
      }),
      summary: null,
    };
  }

  const rows = await prisma.lawRequirement.findMany({
    where: { AND: [{ profileId: profile.id, ...narrow }, requirementVisibleWhere(user)] },
    include: { _count: { select: { tasks: { where: { status: "OPEN", archivedAt: null } } } } },
    orderBy: [{ register: "asc" }, { title: "asc" }],
  });
  const content = findVersion(await loadVersions(prisma), profile.contentVersion)?.content ?? { legislation: [], checklists: [] };

  if (key === "register") {
    const names = await loadNames(prisma, { users: rows.map((r) => r.ownerId), departments: rows.map((r) => r.departmentId) });
    const evaluated = rows.map((r) => ({ r, facts: evaluationFacts(r), inScope: rowInScope(r, profile, content) }));
    return {
      ...head,
      columns: ["Reference", "Requirement", "Register", "Category", "In this profile", "Status", ...(profile.showRating ? ["Self-assessed rating %"] : []), "Responsible", "Department", "Last checked", "Next review", "Needs attention", "Open tasks"],
      rows: evaluated.map(({ r, facts, inScope }) => {
        const status = evaluationStatus(facts);
        const attention = inScope && r.isRelevant && (r.reviewRequired || isReviewOverdue(facts, today));
        return [
          r.reference,
          r.title,
          r.register,
          r.category,
          inScope ? "Yes" : "No – outside the current scope",
          EVALUATION_STATUS_LABELS[status],
          ...(profile.showRating ? [r.rating] : []),
          r.ownerId ? (names.users.get(r.ownerId) ?? "") : "",
          r.departmentId ? (names.departments.get(r.departmentId) ?? "") : "",
          dateOnly(r.evaluatedOn),
          dateOnly(r.nextReviewDate),
          attention ? (r.reviewRequired ? "Law changed – review" : "Review overdue") : "",
          r._count.tasks,
        ];
      }),
      summary: complianceSummary(evaluated.map(({ r, facts, inScope }) => ({ ...facts, inScope, rating: r.rating })), today),
    };
  }

  // links: explicit associations + raised follow-ups of the visible requirements
  const ids = rows.map((r) => r.id);
  const byId = new Map(rows.map((r) => [r.id, r]));
  const [links, raised] = await Promise.all([
    prisma.lawLink.findMany({ where: { requirementId: { in: ids } }, orderBy: { createdAt: "asc" } }),
    prisma.recordLink.findMany({ where: { sourceType: REQUIREMENT_ENTITY, sourceId: { in: ids } }, orderBy: { createdAt: "asc" } }),
  ]);
  const out: LawReportCell[][] = [];
  for (const l of links) {
    const summary = await describeEntity(user, l.targetType, l.targetId);
    if (!summary) continue;
    const r = byId.get(l.requirementId)!;
    out.push([`${r.reference} · ${r.title}`, "Linked", LAW_LINK_TARGET_LABELS[l.targetType as LawLinkTarget] ?? l.targetType, summary.label, "", l.context, dateOnly(l.createdAt)]);
  }
  for (const link of raised) {
    const summary = await describeEntity(user, link.targetType, link.targetId);
    if (!summary) continue;
    const r = byId.get(link.sourceId)!;
    const status = await followUpStatus(link.targetType, link.targetId);
    out.push([`${r.reference} · ${r.title}`, "Raised from Law", link.kind === "incident" ? "Incident (Non Compliance)" : "Corrective action", summary.label, status.resolved ? "Resolved" : status.label, "", dateOnly(link.createdAt)]);
  }
  return { ...head, columns: ["Requirement", "How", "Record type", "Record", "Follow-up status", "Context", "Date"], rows: out, summary: null };
}
