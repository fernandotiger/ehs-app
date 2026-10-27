import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { ASSESSMENT_STATUS_LABELS, PROGRAMME_STATUS_LABELS, STRATEGY_STATUS_LABELS, TASK_KIND_SHORT, TASK_STATUS_LABELS } from "@/lib/risk/labels";
import { RISK_BAND_LABELS, RISK_METHOD_LABELS, type RiskBand, type RiskMethod } from "@/lib/risk/scoring";
import { RISK_REPORT_DATE_MEANING, RISK_REPORT_LABELS, type RiskReportKey, type RiskReportQuery } from "@/lib/validation/risk";
import type { CurrentUser } from "@/server/auth/current-user";
import { prisma } from "@/server/db/client";
import type { RiskReportResultDto } from "./risk.dto";
import { assessmentVisibleWhere, objectiveVisibleWhere, programmeVisibleWhere, targetVisibleWhere, taskVisibleWhere } from "./risk-access.policy";
import { readRules } from "./forms";
import { classify } from "./scoring";
import { programmeProgress, targetProgress } from "./strategy";
import { csvName, csvResponse, dateOnly, loadNames, todayFor, toDate } from "./support";
import { isReviewOverdue, isTaskOverdue } from "./workflow";

/**
 * Risk reports 1–7 (spec "Reports"): site + optional period, CSV (formula-leading text is
 * escaped by csvCell) and print. Dates follow each report: assessment history (approvals and
 * rescorings), periodic-review dates, task creation dates or strategic deadlines. Score
 * reductions use retained historical scores only – nothing is fabricated; empty means empty.
 */

type Row = (string | number | null)[];
type Built = Omit<RiskReportResultDto, "key" | "title" | "period" | "dateMeaning">;

function range(q: RiskReportQuery): { gte?: Date; lt?: Date } | undefined {
  if (!q.from && !q.to) return undefined;
  return { ...(q.from ? { gte: toDate(q.from) } : {}), ...(q.to ? { lt: new Date(toDate(q.to).getTime() + 86_400_000) } : {}) };
}

function assessmentWhere(user: CurrentUser, q: RiskReportQuery): Prisma.RiskAssessmentWhereInput {
  const period = range(q);
  return { AND: [assessmentVisibleWhere(user), { status: { not: "ARCHIVED" } }, q.siteId ? { siteId: q.siteId } : {}, period ? { revisions: { some: { date: period } } } : {}] };
}

const bandLabel = (b: string | null) => (b ? (RISK_BAND_LABELS[b as RiskBand] ?? b) : null);
const methodLabel = (m: string) => RISK_METHOD_LABELS[m as RiskMethod] ?? m;

async function byDepartment(user: CurrentUser, q: RiskReportQuery): Promise<Built> {
  const today = todayFor(user.timeZone);
  const rows = await prisma.riskAssessment.findMany({ where: assessmentWhere(user, q), select: { departmentId: true, siteId: true, status: true, reviewDate: true } });
  const names = await loadNames(prisma, { departments: rows.map((r) => r.departmentId), sites: rows.map((r) => r.siteId) });
  const groups = new Map<string, { dept: string; site: string; total: number; DRAFT: number; AWAITING_APPROVAL: number; APPROVED: number; overdue: number }>();
  for (const r of rows) {
    const key = r.departmentId ?? "";
    const g = groups.get(key) ?? { dept: r.departmentId ? (names.departments.get(r.departmentId) ?? "Unknown") : "No department", site: r.siteId ? (names.sites.get(r.siteId) ?? "") : "", total: 0, DRAFT: 0, AWAITING_APPROVAL: 0, APPROVED: 0, overdue: 0 };
    g.total += 1;
    if (r.status !== "ARCHIVED") g[r.status] += 1;
    if (isReviewOverdue(r.status, dateOnly(r.reviewDate), today)) g.overdue += 1;
    groups.set(key, g);
  }
  const list = [...groups.values()].sort((a, b) => b.total - a.total || a.dept.localeCompare(b.dept));
  const sum = (k: "total" | "DRAFT" | "AWAITING_APPROVAL" | "APPROVED" | "overdue") => list.reduce((s, g) => s + g[k], 0);
  return {
    chart: list.map((g) => ({ label: g.dept, value: g.total })),
    columns: ["Department", "Site", "Assessments", "Draft", "Awaiting approval", "Approved", "Review overdue"],
    rows: list.length ? [...list.map((g) => [g.dept, g.site, g.total, g.DRAFT, g.AWAITING_APPROVAL, g.APPROVED, g.overdue] as Row), ["Total", "", sum("total"), sum("DRAFT"), sum("AWAITING_APPROVAL"), sum("APPROVED"), sum("overdue")]] : [],
    notes: ["Archived assessments are not counted."],
  };
}

async function byHazard(user: CurrentUser, q: RiskReportQuery): Promise<Built> {
  const rows = await prisma.riskAssessment.findMany({
    where: assessmentWhere(user, q),
    select: { reference: true, title: true, status: true, method: true, rules: true, siteId: true, hazards: { orderBy: { sortOrder: "asc" }, select: { name: true, score: true, consequence: true, controls: true } } },
    orderBy: { reference: "asc" },
  });
  const bands = new Map<string, number>();
  const out: Row[] = [];
  for (const a of rows) {
    const rules = readRules(a.rules, a.method);
    for (const h of a.hazards) {
      const band = classify(h.score, rules);
      if (band) bands.set(RISK_BAND_LABELS[band], (bands.get(RISK_BAND_LABELS[band]) ?? 0) + 1);
      out.push([a.reference, a.title, h.name || "Untitled", h.consequence, h.controls, h.score, band ? RISK_BAND_LABELS[band] : null, methodLabel(a.method), ASSESSMENT_STATUS_LABELS[a.status]]);
    }
  }
  return {
    chart: [...bands.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value),
    columns: ["Assessment", "Title", "Hazard / aspect", "Consequence", "Current controls", "Score", "Risk level", "Method", "Status"],
    rows: out,
    notes: ["One row per hazard / aspect, scored with the rules each assessment captured."],
  };
}

async function scoreReductions(user: CurrentUser, q: RiskReportQuery): Promise<Built> {
  const rows = await prisma.riskAssessment.findMany({
    where: { AND: [assessmentWhere(user, q), { revisions: { some: {} } }] },
    select: { reference: true, title: true, method: true, revisions: { orderBy: { revision: "asc" }, select: { revision: true, date: true, score: true, band: true, action: true } } },
    orderBy: { reference: "asc" },
  });
  const to = q.to;
  const out: Row[] = [];
  const chart: { label: string; value: number }[] = [];
  for (const a of rows) {
    const history = a.revisions.filter((r) => !to || dateOnly(r.date)! <= to);
    const first = history[0];
    const last = history[history.length - 1];
    if (!first || !last || first.score === null || last.score === null) continue;
    const reduction = first.score - last.score;
    out.push([a.reference, a.title, methodLabel(a.method), first.score, bandLabel(first.band), dateOnly(first.date), last.score, bandLabel(last.band), dateOnly(last.date), reduction, history.length]);
    if (reduction > 0) chart.push({ label: a.reference, value: reduction });
  }
  return {
    chart: chart.sort((a, b) => b.value - a.value).slice(0, 12),
    columns: ["Assessment", "Title", "Method", "First retained score", "First level", "First date", "Latest retained score", "Latest level", "Latest date", "Reduction", "Retained revisions"],
    rows: out,
    notes: ["Scores come from retained approval and task-rescoring snapshots (History & reviews); a positive reduction means lower risk."],
  };
}

async function reviewCoverage(user: CurrentUser, q: RiskReportQuery): Promise<Built> {
  const today = todayFor(user.timeZone);
  const period = range(q);
  const rows = await prisma.riskAssessment.findMany({
    where: { AND: [assessmentVisibleWhere(user), { status: "APPROVED" }, q.siteId ? { siteId: q.siteId } : {}] },
    select: { reference: true, title: true, status: true, reviewDate: true, ownerId: true, reviews: { where: period ? { reviewDate: period } : {}, orderBy: { reviewDate: "desc" }, select: { reviewDate: true, reviewerName: true } } },
    orderBy: { reviewDate: "asc" },
  });
  const names = await loadNames(prisma, { users: rows.map((r) => r.ownerId) });
  const reviewed = rows.filter((r) => r.reviews.length).length;
  const overdue = rows.filter((r) => isReviewOverdue(r.status, dateOnly(r.reviewDate), today)).length;
  return {
    chart: rows.length ? [{ label: "Reviewed in period", value: reviewed }, { label: "Not reviewed in period", value: rows.length - reviewed }, { label: "Review overdue now", value: overdue }] : [],
    columns: ["Assessment", "Title", "Responsible", "Reviews in period", "Latest review in period", "Reviewed by", "Next review date", "Review status"],
    rows: rows.map((r) => [
      r.reference,
      r.title,
      r.ownerId ? (names.users.get(r.ownerId) ?? null) : null,
      r.reviews.length,
      dateOnly(r.reviews[0]?.reviewDate),
      r.reviews[0]?.reviewerName ?? null,
      dateOnly(r.reviewDate),
      isReviewOverdue(r.status, dateOnly(r.reviewDate), today) ? "Overdue" : "Current",
    ]),
    notes: rows.length ? [`${reviewed} of ${rows.length} approved assessment${rows.length === 1 ? "" : "s"} reviewed in the period.`] : [],
  };
}

async function outstandingStrategy(user: CurrentUser, q: RiskReportQuery): Promise<Built> {
  const today = todayFor(user.timeZone);
  const period = range(q);
  const deadline = period ? { deadline: period } : {};
  const [objectives, targets, programmes] = await Promise.all([
    prisma.riskObjective.findMany({ where: { AND: [objectiveVisibleWhere(user), { status: "ACTIVE" }, deadline, q.siteId ? { siteId: q.siteId } : {}] }, select: { title: true, ownerId: true, deadline: true, status: true, targets: { select: { direction: true, baseline: true, current: true, goal: true } } }, orderBy: { deadline: "asc" } }),
    prisma.riskTarget.findMany({ where: { AND: [targetVisibleWhere(user), { status: "ACTIVE" }, deadline, q.siteId ? { objective: { siteId: q.siteId } } : {}] }, select: { title: true, ownerId: true, deadline: true, status: true, direction: true, baseline: true, current: true, goal: true, unit: true, objective: { select: { title: true } } }, orderBy: { deadline: "asc" } }),
    prisma.riskProgramme.findMany({ where: { AND: [programmeVisibleWhere(user), { status: { not: "COMPLETED" } }, deadline, q.siteId ? { siteId: q.siteId } : {}] }, select: { title: true, ownerId: true, deadline: true, status: true, objective: { select: { title: true } }, tasks: { select: { status: true } } }, orderBy: { deadline: "asc" } }),
  ]);
  const names = await loadNames(prisma, { users: [...objectives, ...targets, ...programmes].map((r) => r.ownerId) });
  const owner = (id: string) => names.users.get(id) ?? "Unknown";
  const late = (d: Date) => (dateOnly(d)! < today ? "Yes" : "No");
  const rows: Row[] = [
    ...objectives.map((o) => {
      const p = o.targets.map((t) => targetProgress(t));
      return ["Objective", o.title, "", owner(o.ownerId), dateOnly(o.deadline), STRATEGY_STATUS_LABELS[o.status], p.length ? Math.round(p.reduce((a, b) => a + b, 0) / p.length) : 0, late(o.deadline)] as Row;
    }),
    ...targets.map((t) => ["Target", `${t.title} (${t.current} / ${t.goal} ${t.unit})`, t.objective.title, owner(t.ownerId), dateOnly(t.deadline), STRATEGY_STATUS_LABELS[t.status], targetProgress(t), late(t.deadline)] as Row),
    ...programmes.map((p) => ["Programme", p.title, p.objective.title, owner(p.ownerId), dateOnly(p.deadline), PROGRAMME_STATUS_LABELS[p.status], programmeProgress(p.tasks.map((t) => t.status)), late(p.deadline)] as Row),
  ];
  return {
    chart: [
      { label: "Objectives", value: objectives.length },
      { label: "Targets", value: targets.length },
      { label: "Programmes", value: programmes.length },
    ].filter((c) => c.value > 0),
    columns: ["Type", "Title", "Objective", "Owner", "Deadline", "Status", "Progress %", "Past deadline"],
    rows,
    notes: ["Progress: targets from baseline toward goal; programmes = completed linked tasks / all linked tasks; objectives = average of their targets."],
  };
}

async function taskRows(user: CurrentUser, q: RiskReportQuery, outstanding: boolean) {
  const period = range(q);
  return prisma.riskTask.findMany({
    where: { AND: [taskVisibleWhere(user), outstanding ? { status: { not: "COMPLETED" } } : {}, period ? { createdOn: period } : {}, q.siteId ? { siteId: q.siteId } : {}] },
    select: {
      reference: true,
      title: true,
      kind: true,
      status: true,
      ownerId: true,
      createdOn: true,
      dueDate: true,
      completedOn: true,
      completionComment: true,
      parent: { select: { reference: true } },
      programme: { select: { title: true } },
      assessment: { select: { reference: true } },
    },
    orderBy: [{ dueDate: "asc" }, { reference: "asc" }],
  });
}

async function outstandingTasks(user: CurrentUser, q: RiskReportQuery): Promise<Built> {
  const today = todayFor(user.timeZone);
  const rows = await taskRows(user, q, true);
  const names = await loadNames(prisma, { users: rows.map((r) => r.ownerId) });
  const overdue = rows.filter((r) => isTaskOverdue(r.status, dateOnly(r.dueDate)!, today)).length;
  return {
    chart: rows.length ? [{ label: "Overdue", value: overdue }, { label: "Not yet due", value: rows.length - overdue }] : [],
    columns: ["Task", "Title", "Type", "Parent", "Responsible", "Created", "Due", "Status", "Overdue", "Programme", "Assessment"],
    rows: rows.map((r) => [
      r.reference,
      r.title,
      TASK_KIND_SHORT[r.kind],
      r.parent?.reference ?? null,
      names.users.get(r.ownerId) ?? "Unknown",
      dateOnly(r.createdOn),
      dateOnly(r.dueDate),
      TASK_STATUS_LABELS[r.status],
      isTaskOverdue(r.status, dateOnly(r.dueDate)!, today) ? "Yes" : "No",
      r.programme.title,
      r.assessment?.reference ?? null,
    ]),
    notes: [],
  };
}

async function taskSummary(user: CurrentUser, q: RiskReportQuery): Promise<Built> {
  const rows = await taskRows(user, q, false);
  const names = await loadNames(prisma, { users: rows.map((r) => r.ownerId) });
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(TASK_STATUS_LABELS[r.status], (counts.get(TASK_STATUS_LABELS[r.status]) ?? 0) + 1);
  return {
    chart: [...counts.entries()].map(([label, value]) => ({ label, value })),
    columns: ["Task", "Title", "Type", "Parent", "Responsible", "Created", "Due", "Status", "Completed", "Completion comment"],
    rows: rows.map((r) => [r.reference, r.title, TASK_KIND_SHORT[r.kind], r.parent?.reference ?? null, names.users.get(r.ownerId) ?? "Unknown", dateOnly(r.createdOn), dateOnly(r.dueDate), TASK_STATUS_LABELS[r.status], dateOnly(r.completedOn), r.completionComment]),
    notes: rows.length ? [`${rows.length} task${rows.length === 1 ? "" : "s"} created in the period, ${rows.filter((r) => r.status === "COMPLETED").length} completed.`] : [],
  };
}

const BUILDERS: Record<RiskReportKey, (user: CurrentUser, q: RiskReportQuery) => Promise<Built>> = {
  "by-department": byDepartment,
  "by-hazard": byHazard,
  "score-reductions": scoreReductions,
  "review-coverage": reviewCoverage,
  "outstanding-strategy": outstandingStrategy,
  "outstanding-tasks": outstandingTasks,
  "task-summary": taskSummary,
};

export const riskReportsService = {
  async run(user: CurrentUser, key: RiskReportKey, q: RiskReportQuery): Promise<RiskReportResultDto | Response> {
    const result = await BUILDERS[key](user, q);
    const site = q.siteId ? await prisma.site.findUnique({ where: { id: q.siteId }, select: { name: true } }) : null;
    const dto: RiskReportResultDto = { key, title: RISK_REPORT_LABELS[key], dateMeaning: RISK_REPORT_DATE_MEANING[key], period: { from: q.from, to: q.to, siteName: site?.name ?? null }, ...result };
    if (q.format === "csv") return csvResponse(csvName(`risk-report-${key}`), [dto.columns, ...dto.rows]);
    return dto;
  },
};
