import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import {
  ACTION_KIND_LABELS,
  ACTION_STATE_LABELS,
  CAUSE_GROUP_LABELS,
  INCIDENT_STATUS_LABELS,
  INVESTIGATION_STATUS_LABELS,
  SEVERITY_LABELS,
  inclusiveDays,
} from "@/lib/incidents";
import { REPORT_LABELS, type ReportKey, type ReportQuery } from "@/lib/validation/incidents";
import type { CurrentUser } from "@/server/auth/current-user";
import { prisma } from "@/server/db/client";
import { BusinessRuleError } from "@/server/http/errors";
import { actionVisibleWhere, incidentVisibleWhere } from "./incident-access.policy";
import { causeCatalogue } from "./incident-lookups";
import type { ReportResultDto } from "./incident.dto";
import { csvName, csvResponse, dateOnly, loadNames, todayFor, toDate } from "./support";
import { isActionOverdue } from "./workflow";

/**
 * Standard incident reports (period + optional site, CSV and print). Values are calendar-based:
 * no working-day precision, no invented reportee delivery, missing optional values stay blank.
 */

type Row = (string | number | null)[];

function period(q: ReportQuery) {
  if (q.from > q.to) throw new BusinessRuleError("Choose a valid reporting period.", { blockers: ["The period end is before its start."] });
  return { gte: toDate(q.from), lt: new Date(toDate(q.to).getTime() + 86_400_000) };
}

function incidentWhere(user: CurrentUser, q: ReportQuery): Prisma.IncidentWhereInput {
  return { AND: [incidentVisibleWhere(user), { archivedAt: null, isDraft: false, occurredAt: period(q) }, q.siteId ? { siteId: q.siteId } : {}] };
}

async function byType(user: CurrentUser, q: ReportQuery) {
  const rows = await prisma.incident.findMany({ where: incidentWhere(user, q), select: { typeLabel: true, subtypeLabel: true, severity: true } });
  const groups = new Map<string, { type: string; subtype: string; total: number; MINOR: number; MAJOR: number; CRITICAL: number }>();
  for (const r of rows) {
    const key = `${r.typeLabel}\u0000${r.subtypeLabel ?? ""}`;
    const g = groups.get(key) ?? { type: r.typeLabel, subtype: r.subtypeLabel ?? "", total: 0, MINOR: 0, MAJOR: 0, CRITICAL: 0 };
    g.total += 1;
    g[r.severity] += 1;
    groups.set(key, g);
  }
  const list = [...groups.values()].sort((a, b) => a.type.localeCompare(b.type) || b.total - a.total);
  const byTypeTotals = new Map<string, number>();
  for (const g of list) byTypeTotals.set(g.type, (byTypeTotals.get(g.type) ?? 0) + g.total);
  return {
    chart: [...byTypeTotals.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value),
    columns: ["Type", "Subtype", "Incidents", "Minor", "Major", "Critical"],
    rows: [...list.map((g) => [g.type, g.subtype, g.total, g.MINOR, g.MAJOR, g.CRITICAL] as Row), ["Total", "", rows.length, rows.filter((r) => r.severity === "MINOR").length, rows.filter((r) => r.severity === "MAJOR").length, rows.filter((r) => r.severity === "CRITICAL").length]],
    notes: [],
  };
}

async function byCause(user: CurrentUser, q: ReportQuery) {
  const [rows, causes] = await Promise.all([
    prisma.incident.findMany({ where: { AND: [incidentWhere(user, q), { investigation: { isNot: null } }] }, select: { investigation: { select: { causeIds: true } } } }),
    causeCatalogue(prisma),
  ]);
  const counts = new Map<string, number>();
  for (const r of rows) for (const id of new Set(r.investigation?.causeIds ?? [])) counts.set(id, (counts.get(id) ?? 0) + 1);
  const list = [...counts.entries()]
    .map(([id, value]) => ({ cause: causes.get(id), value }))
    .filter((c) => c.cause)
    .sort((a, b) => a.cause!.group.localeCompare(b.cause!.group) || b.value - a.value);
  return {
    chart: list.map((c) => ({ label: c.cause!.label, value: c.value })).sort((a, b) => b.value - a.value).slice(0, 12),
    columns: ["Cause group", "Cause", "Incidents"],
    rows: list.map((c) => [CAUSE_GROUP_LABELS[c.cause!.group], c.cause!.label, c.value] as Row),
    notes: ["Only incidents with an investigation are counted. An incident with several causes is counted once per cause."],
  };
}

async function daysLostByDepartment(user: CurrentUser, q: ReportQuery) {
  const rows = await prisma.incident.findMany({
    where: { AND: [incidentWhere(user, q), { investigation: { isNot: null } }] },
    select: { departmentId: true, siteId: true, investigation: { select: { operatingHoursLost: true, absences: { select: { startDate: true, endDate: true, restricted: true } } } } },
  });
  const names = await loadNames(prisma, { departments: rows.map((r) => r.departmentId), sites: rows.map((r) => r.siteId) });
  const groups = new Map<string, { label: string; days: number; restricted: number; hours: number; incidents: number }>();
  for (const r of rows) {
    const label = r.departmentId ? `${names.departments.get(r.departmentId) ?? "Unknown"}${r.siteId ? ` (${names.sites.get(r.siteId) ?? ""})` : ""}` : "No department";
    const g = groups.get(label) ?? { label, days: 0, restricted: 0, hours: 0, incidents: 0 };
    const absences = r.investigation?.absences ?? [];
    for (const a of absences) {
      const days = inclusiveDays(dateOnly(a.startDate)!, dateOnly(a.endDate)!);
      if (a.restricted) g.restricted += days;
      else g.days += days;
    }
    g.hours += r.investigation?.operatingHoursLost ?? 0;
    if (absences.length || r.investigation?.operatingHoursLost) g.incidents += 1;
    groups.set(label, g);
  }
  const list = [...groups.values()].filter((g) => g.incidents > 0).sort((a, b) => b.days - a.days);
  return {
    chart: list.map((g) => ({ label: g.label, value: g.days })),
    columns: ["Department", "Calendar days lost", "Restricted duty days (not counted)", "Operating hours lost", "Incidents with losses"],
    rows: [...list.map((g) => [g.label, g.days, g.restricted, g.hours, g.incidents] as Row), ["Total", list.reduce((s, g) => s + g.days, 0), list.reduce((s, g) => s + g.restricted, 0), list.reduce((s, g) => s + g.hours, 0), list.reduce((s, g) => s + g.incidents, 0)]],
    notes: [
      "Days lost are inclusive calendar days of each absence period (not working days), summed per incident department.",
      "Restricted duties are shown separately and not counted as days lost. Overlapping periods are not merged. Operating hours are not converted to days.",
    ],
  };
}

async function actionTracking(user: CurrentUser, q: ReportQuery) {
  const today = todayFor(user.timeZone);
  const rows = await prisma.correctiveAction.findMany({
    where: { AND: [actionVisibleWhere(user), { archivedAt: null, createdAt: period(q) }, q.siteId ? { siteId: q.siteId } : {}] },
    select: {
      reference: true,
      description: true,
      kind: true,
      state: true,
      dueDate: true,
      plannedReviewDate: true,
      owner: { select: { name: true } },
      reviewer: { select: { name: true } },
      tasks: { select: { done: true, dueDate: true } },
      incidents: { select: { incident: { select: { reference: true } } } },
    },
    orderBy: [{ dueDate: "asc" }],
  });
  const stateCounts = new Map<string, number>();
  for (const r of rows) stateCounts.set(ACTION_STATE_LABELS[r.state], (stateCounts.get(ACTION_STATE_LABELS[r.state]) ?? 0) + 1);
  return {
    chart: [...stateCounts.entries()].map(([label, value]) => ({ label, value })),
    columns: ["Reference", "Action", "Kind", "State", "Owner", "Due", "Overdue", "Tasks done", "Overdue tasks", "Reviewer", "Review date", "Incidents"],
    rows: rows.map((r) => {
      const due = dateOnly(r.dueDate)!;
      const review = dateOnly(r.plannedReviewDate);
      return [
        r.reference,
        r.description,
        ACTION_KIND_LABELS[r.kind],
        ACTION_STATE_LABELS[r.state],
        r.owner.name,
        due,
        isActionOverdue({ state: r.state, dueDate: due, plannedReviewDate: review }, today) ? "Yes" : "No",
        `${r.tasks.filter((t) => t.done).length}/${r.tasks.length}`,
        r.tasks.filter((t) => !t.done && dateOnly(t.dueDate)! < today).length,
        r.reviewer?.name ?? null,
        review,
        r.incidents.map((i) => i.incident.reference).join("; ") || null,
      ] as Row;
    }),
    notes: ["Actions raised in the period. Completed actions stay open until their effectiveness is reviewed."],
  };
}

async function incidentTracking(user: CurrentUser, q: ReportQuery) {
  const today = todayFor(user.timeZone);
  const rows = await prisma.incident.findMany({
    where: incidentWhere(user, q),
    select: {
      reference: true,
      title: true,
      typeLabel: true,
      severity: true,
      status: true,
      occurredAt: true,
      submittedAt: true,
      closedAt: true,
      siteId: true,
      departmentId: true,
      investigationTargetDate: true,
      investigation: { select: { status: true } },
      actions: { select: { action: { select: { state: true, archivedAt: true } } } },
    },
    orderBy: { occurredAt: "asc" },
  });
  const names = await loadNames(prisma, { sites: rows.map((r) => r.siteId), departments: rows.map((r) => r.departmentId) });
  const statusCounts = new Map<string, number>();
  for (const r of rows) statusCounts.set(INCIDENT_STATUS_LABELS[r.status], (statusCounts.get(INCIDENT_STATUS_LABELS[r.status]) ?? 0) + 1);
  return {
    chart: [...statusCounts.entries()].map(([label, value]) => ({ label, value })),
    columns: ["Reference", "Title", "Type", "Severity", "Status", "Occurred", "Site", "Department", "Investigation", "Target date", "Days open", "Open actions"],
    rows: rows.map((r) => {
      const start = (r.submittedAt ?? r.occurredAt)!.toISOString().slice(0, 10);
      const end = r.closedAt ? r.closedAt.toISOString().slice(0, 10) : today;
      return [
        r.reference,
        r.title,
        r.typeLabel,
        SEVERITY_LABELS[r.severity],
        INCIDENT_STATUS_LABELS[r.status],
        r.occurredAt?.toISOString().slice(0, 10) ?? null,
        r.siteId ? (names.sites.get(r.siteId) ?? null) : null,
        r.departmentId ? (names.departments.get(r.departmentId) ?? null) : null,
        r.investigation ? INVESTIGATION_STATUS_LABELS[r.investigation.status] : null,
        dateOnly(r.investigationTargetDate),
        Math.max(0, inclusiveDays(start, end) - 1),
        r.actions.filter((a) => !a.action.archivedAt && ["OPEN", "IN_PROGRESS", "AWAITING_EFFECTIVENESS"].includes(a.action.state)).length,
      ] as Row;
    }),
    notes: ["Days open counts calendar days from submission to closure (or today)."],
  };
}

const BUILDERS: Record<ReportKey, (user: CurrentUser, q: ReportQuery) => Promise<Omit<ReportResultDto, "key" | "title" | "period">>> = {
  "by-type": byType,
  "by-cause": byCause,
  "days-lost": daysLostByDepartment,
  actions: actionTracking,
  incidents: incidentTracking,
};

export const reportsService = {
  async run(user: CurrentUser, key: ReportKey, q: ReportQuery): Promise<ReportResultDto | Response> {
    const result = await BUILDERS[key](user, q);
    const site = q.siteId ? await prisma.site.findUnique({ where: { id: q.siteId }, select: { name: true } }) : null;
    const dto: ReportResultDto = { key, title: REPORT_LABELS[key], period: { from: q.from, to: q.to, siteName: site?.name ?? null }, ...result };
    if (q.format === "csv") return csvResponse(csvName(`incident-report-${key}`), [dto.columns, ...dto.rows]);
    return dto;
  },
};
