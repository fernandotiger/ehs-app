import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { paginate, type Paginated } from "@/lib/validation/common";
import type { AckExportQuery, AckReportQuery, DocumentAuditQuery } from "@/lib/validation/documents";
import { recordAudit } from "@/server/audit/audit-service";
import type { CurrentUser } from "@/server/auth/current-user";
import { prisma } from "@/server/db/client";
import type { RequestMeta } from "@/server/http/api-handler";
import { NotFoundError } from "@/server/http/errors";
import { settingsService } from "@/server/modules/settings/settings.service";
import { dueDateFor, satisfiesRequirement } from "./acknowledgement-rules";
import { DOCUMENT_AUDIT, DOCUMENT_ENTITY, DOCUMENT_VERSION_ENTITY, PER_EMPLOYEE_AUDIT_ACTIONS } from "./document-audit-actions";
import { iso } from "./document-mappers";
import { buildRequirement, computeComplianceStats, overdueWhere, requirementSelect, type Requirement } from "./document-requirement";
import { csvFileName, csvRow, csvStreamResponse } from "./csv";
import { surveyDocumentsWhere } from "./survey-summary";
import type { AckReportRow, ComplianceStats, ComplianceSummaryResponse, DocumentAuditEntry } from "./document.dto";

/**
 * Acknowledgement reporting: who has acknowledged / is outstanding / overdue, CSV audit
 * trail exports and the compliance dashboard. All population maths runs in SQL.
 */

async function loadRequirement(documentId: string) {
  const [doc, defaults] = await Promise.all([prisma.document.findUnique({ where: { id: documentId }, select: requirementSelect }), settingsService.get("system")]);
  if (!doc) throw new NotFoundError();
  return { doc, defaults, req: buildRequirement(doc, defaults) };
}

function peopleFilters(query: { q?: string; departmentId?: string; locationId?: string }): Prisma.UserWhereInput[] {
  const filters: Prisma.UserWhereInput[] = [];
  if (query.departmentId) filters.push({ departmentId: query.departmentId });
  if (query.locationId) filters.push({ locationId: query.locationId });
  if (query.q) {
    filters.push({
      OR: [
        { name: { contains: query.q, mode: "insensitive" } },
        { email: { contains: query.q, mode: "insensitive" } },
        { employeeNumber: { contains: query.q, mode: "insensitive" } },
      ],
    });
  }
  return filters;
}

function reportRowSelect(req: Requirement) {
  return {
    id: true,
    name: true,
    email: true,
    employeeNumber: true,
    jobTitle: true,
    createdAt: true,
    department: { select: { id: true, name: true } },
    location: { select: { id: true, name: true } },
    manager: { select: { name: true } },
    documentAcknowledgements: {
      where: { documentId: req.documentId, versionNumber: { gte: req.fromVersion } },
      orderBy: { versionNumber: "desc" },
      take: 1,
      select: { id: true, versionNumber: true, acknowledgedAt: true, clientAcknowledgedAt: true, source: true },
    },
    acknowledgementReminders: {
      where: { documentId: req.documentId, versionNumber: req.fromVersion },
      take: 1,
      select: { remindersSent: true, lastRemindedAt: true, escalatedAt: true },
    },
  } satisfies Prisma.UserSelect;
}

type ReportUser = Prisma.UserGetPayload<{ select: ReturnType<typeof reportRowSelect> }>;

function toReportRow(u: ReportUser, req: Requirement, now: Date): AckReportRow {
  const ack = u.documentAcknowledgements[0];
  const reminder = u.acknowledgementReminders[0];
  const dueAt = !ack && req.since ? dueDateFor(req.since, u.createdAt, req.settings.ackDueDays) : null;
  return {
    userId: u.id,
    name: u.name,
    email: u.email,
    employeeNumber: u.employeeNumber,
    jobTitle: u.jobTitle,
    department: u.department,
    location: u.location,
    acknowledgement: ack
      ? { id: ack.id, versionNumber: ack.versionNumber, acknowledgedAt: ack.acknowledgedAt.toISOString(), clientAcknowledgedAt: iso(ack.clientAcknowledgedAt), source: ack.source }
      : null,
    dueAt: iso(dueAt),
    overdue: Boolean(dueAt && now.getTime() > dueAt.getTime()),
    remindersSent: reminder?.remindersSent ?? 0,
    lastRemindedAt: iso(reminder?.lastRemindedAt),
    escalatedAt: iso(reminder?.escalatedAt),
  };
}

const EXPORT_BATCH = 500;

export const complianceService = {
  async stats(documentId: string, now = new Date()): Promise<ComplianceStats> {
    const { doc, defaults } = await loadRequirement(documentId);
    return computeComplianceStats(doc, defaults, now);
  },

  /** Paginated, searchable list of acknowledged / outstanding / overdue people. */
  async report(documentId: string, query: AckReportQuery, now = new Date()): Promise<Paginated<AckReportRow>> {
    const { req } = await loadRequirement(documentId);
    let statusWhere: Prisma.UserWhereInput;
    if (query.status === "acknowledged") statusWhere = { AND: [req.population, req.acknowledged] };
    else if (query.status === "overdue") statusWhere = overdueWhere(req, now) ?? { id: { in: [] } };
    else statusWhere = { AND: [req.population, req.outstanding] };

    const where: Prisma.UserWhereInput = { AND: [statusWhere, ...peopleFilters(query)] };
    const [users, total] = await Promise.all([
      prisma.user.findMany({ where, select: reportRowSelect(req), orderBy: [{ name: "asc" }, { id: "asc" }], ...paginate(query) }),
      prisma.user.count({ where }),
    ]);
    return { items: users.map((u) => toReportRow(u, req, now)), total, page: query.page, pageSize: query.pageSize };
  },

  /**
   * CSV export. "acknowledged" = the full, signed acknowledgement audit trail for the document
   * (every version); "outstanding" = people who still have to acknowledge the required version.
   * Streams in keyset-paginated batches.
   */
  async exportCsv(documentId: string, query: AckExportQuery, actor: CurrentUser, meta: RequestMeta, now = new Date()): Promise<Response> {
    const { doc, req } = await loadRequirement(documentId);
    await recordAudit({
      entityType: DOCUMENT_ENTITY,
      entityId: documentId,
      action: DOCUMENT_AUDIT.ACKNOWLEDGEMENTS_EXPORTED,
      actor,
      metadata: { status: query.status, departmentId: query.departmentId ?? null, locationId: query.locationId ?? null },
      meta,
    });

    if (query.status === "acknowledged") {
      const userFilter: Prisma.UserWhereInput = { AND: peopleFilters(query) };
      let cursor: string | undefined;
      let done = false;
      const header = csvRow([
        "Employee", "Email", "Employee number", "Department", "Location", "Document", "Version", "Acknowledged at (ISO)",
        "Client acknowledged at (ISO)", "Source", "Counts toward current requirement", "IP address", "User agent", "Statement", "Signature",
      ]);
      return csvStreamResponse(csvFileName(doc.title, "acknowledgements", now), header, async () => {
        if (done) return null;
        const rows = await prisma.documentAcknowledgement.findMany({
          where: { documentId, user: userFilter },
          orderBy: { id: "asc" },
          take: EXPORT_BATCH,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
          include: { user: { select: { employeeNumber: true, department: { select: { name: true } }, location: { select: { name: true } } } } },
        });
        if (rows.length < EXPORT_BATCH) done = true;
        if (!rows.length) return null;
        cursor = rows[rows.length - 1]!.id;
        return rows
          .map((a) =>
            csvRow([
              a.userName, a.userEmail, a.user.employeeNumber, a.user.department?.name, a.user.location?.name, a.documentTitle, a.versionNumber,
              a.acknowledgedAt, a.clientAcknowledgedAt, a.source, satisfiesRequirement(a.versionNumber, doc.ackRequiredFromVersion),
              a.ipAddress, a.userAgent, a.statement, a.signature,
            ]),
          )
          .join("");
      });
    }

    const where: Prisma.UserWhereInput = { AND: [req.population, req.outstanding, ...peopleFilters(query)] };
    const select = reportRowSelect(req);
    let cursor: string | undefined;
    let done = false;
    const header = csvRow([
      "Employee", "Email", "Employee number", "Department", "Location", "Manager", "Document", "Required version", "Due at (ISO)", "Overdue",
      "Reminders sent", "Last reminded at (ISO)", "Escalated at (ISO)",
    ]);
    return csvStreamResponse(csvFileName(doc.title, "outstanding", now), header, async () => {
      if (done) return null;
      const users = await prisma.user.findMany({ where, select, orderBy: { id: "asc" }, take: EXPORT_BATCH, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) });
      if (users.length < EXPORT_BATCH) done = true;
      if (!users.length) return null;
      cursor = users[users.length - 1]!.id;
      return users
        .map((u) => {
          const row = toReportRow(u, req, now);
          return csvRow([
            u.name, u.email, u.employeeNumber, u.department?.name, u.location?.name, u.manager?.name, doc.title, req.fromVersion, row.dueAt, row.overdue,
            row.remindersSent, row.lastRemindedAt, row.escalatedAt,
          ]);
        })
        .join("");
    });
  },

  /** Dashboard / Document Library: published documents (not surveys) requiring acknowledgement, most outstanding first. */
  async summary(limit: number, now = new Date()): Promise<ComplianceSummaryResponse> {
    const [docs, defaults] = await Promise.all([
      prisma.document.findMany({
        where: { status: "PUBLISHED", requiresAcknowledgement: true, ...surveyDocumentsWhere(false) },
        select: { ...requirementSelect, category: { select: { id: true, name: true } } },
        orderBy: { publishedAt: "desc" },
      }),
      settingsService.get("system"),
    ]);
    const items: ComplianceSummaryResponse["items"] = [];
    for (const doc of docs) {
      items.push({ id: doc.id, title: doc.title, category: doc.category, stats: await computeComplianceStats(doc, defaults, now) });
    }
    const totals = items.reduce(
      (t, i) => ({
        documents: t.documents + 1,
        required: t.required + i.stats.required,
        acknowledged: t.acknowledged + i.stats.acknowledged,
        outstanding: t.outstanding + i.stats.outstanding,
        overdue: t.overdue + i.stats.overdue,
      }),
      { documents: 0, required: 0, acknowledged: 0, outstanding: 0, overdue: 0 },
    );
    items.sort((a, b) => b.stats.outstanding - a.stats.outstanding || b.stats.overdue - a.stats.overdue);
    return { items: items.slice(0, limit), totals };
  },

  /** A document's history: its own audit entries plus those of its versions. */
  async history(documentId: string, query: DocumentAuditQuery): Promise<Paginated<DocumentAuditEntry>> {
    const doc = await prisma.document.findUnique({ where: { id: documentId }, select: { versions: { select: { id: true } } } });
    if (!doc) throw new NotFoundError();
    const where: Prisma.AuditLogWhereInput = {
      OR: [
        { entityType: DOCUMENT_ENTITY, entityId: documentId },
        { entityType: DOCUMENT_VERSION_ENTITY, entityId: { in: doc.versions.map((v) => v.id) } },
      ],
      ...(query.kind === "changes" ? { action: { notIn: PER_EMPLOYEE_AUDIT_ACTIONS } } : {}),
      ...(query.q ? { actorName: { contains: query.q, mode: "insensitive" } } : {}),
    };
    const [rows, total] = await Promise.all([
      prisma.auditLog.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], ...paginate(query) }),
      prisma.auditLog.count({ where }),
    ]);
    return {
      items: rows.map((r) => ({
        id: r.id,
        entityType: r.entityType,
        action: r.action,
        actorName: r.actorName,
        changes: r.changes,
        metadata: r.metadata,
        createdAt: r.createdAt.toISOString(),
      })),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  },
};
