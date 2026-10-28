import "server-only";
import { LAW_LINK_TARGET_LABELS, type LawLinkTarget } from "@/lib/law";
import type { LawLinkCreateInput, LawRaiseActionInput, LawRaiseIncidentInput } from "@/lib/validation/law";
import { recordAudit } from "@/server/audit/audit-service";
import type { CurrentUser } from "@/server/auth/current-user";
import { prisma } from "@/server/db/client";
import type { RequestMeta } from "@/server/http/api-handler";
import { ForbiddenError, NotFoundError } from "@/server/http/errors";
import { canViewEntity, describeEntity, requireEntityAccess } from "@/server/modules/entities/registry";
import { followUpStatus, raiseAction, raiseIncidentDraft, type FollowUpSource } from "@/server/modules/incidents/follow-up.service";
import { actionVisibleWhere, incidentVisibleWhere } from "@/server/modules/incidents/incident-access.policy";
import { assessmentVisibleWhere } from "@/server/modules/risk/risk-access.policy";
import { requireTenantId } from "@/server/tenancy/context";
import { NON_COMPLIANCE_KEY, NON_COMPLIANCE_SUBTYPES, nonComplianceReadiness } from "./incident-type";
import { canEvaluate, requirementVisibleWhere } from "./law-access.policy";
import { assertEditable, isUniqueViolation, loadVisibleRequirement, requirementFacts, type RequirementRow } from "./requirement.service";
import { assertActiveUser, assertDepartmentAtSite, blocked, LAW_AUDIT, REQUIREMENT_ENTITY, requirementHref, todayFor } from "./support";
import { linkBlockers, raiseActionBlockers } from "./workflow";

/**
 * Law ↔ Risk ↔ Incident connections (spec "Risk and Incident connections"):
 *  - explicit links to an existing Risk assessment, Incident or Incident action of the profile's
 *    site, with context – unique per requirement and record, visible from both sides;
 *  - raised follow-ups through the Incident follow-up contract (idempotent RecordLinks): one
 *    Non Compliance incident draft per requirement, corrective actions with legal provenance.
 * Linking or closing linked work never changes the evaluation, rating or review flag.
 */

export interface LawLinkDto {
  id: string;
  targetType: LawLinkTarget;
  targetId: string;
  typeLabel: string;
  label: string;
  href: string;
  context: string;
  createdAt: string;
}

export interface LawFollowUpDto {
  id: string;
  kind: "incident" | "action";
  label: string;
  href: string;
  resolved: boolean;
  createdAt: string;
}

export interface LawLinkOptionDto {
  id: string;
  label: string;
  detail: string;
}

/** Back-link card on a Risk assessment / Incident / Incident action. */
export interface LawConnectionDto {
  requirementId: string;
  reference: string;
  title: string;
  profileName: string;
  href: string;
  /** linked = explicit association; raised = this record was raised from the requirement. */
  how: "linked" | "raised";
  context: string;
}

const source = (row: RequirementRow, key: string): FollowUpSource => ({
  type: REQUIREMENT_ENTITY,
  id: row.id,
  key,
  label: `${row.reference} · ${row.title} (${row.profile.name})`,
  href: requirementHref(row.id),
});

/** Site of a link target (null when it does not exist for this tenant). */
async function targetSite(type: LawLinkTarget, id: string): Promise<{ siteId: string | null } | null> {
  if (type === "RiskAssessment") return prisma.riskAssessment.findUnique({ where: { id }, select: { siteId: true } });
  if (type === "Incident") return prisma.incident.findUnique({ where: { id }, select: { siteId: true } });
  return prisma.correctiveAction.findUnique({ where: { id }, select: { siteId: true } });
}

function requireModule(user: CurrentUser, type: LawLinkTarget) {
  const moduleKey = type === "RiskAssessment" ? "risk" : "incidents";
  if (!user.enabledModules.includes(moduleKey)) blocked("This record type cannot be used", [`The ${moduleKey === "risk" ? "Risk" : "Incidents"} module is not enabled for your company.`]);
}

export const lawConnectionService = {
  async links(user: CurrentUser, requirementId: string): Promise<LawLinkDto[]> {
    await loadVisibleRequirement(prisma, user, requirementId);
    const rows = await prisma.lawLink.findMany({ where: { requirementId }, orderBy: { createdAt: "asc" } });
    const out: LawLinkDto[] = [];
    for (const r of rows) {
      const summary = await describeEntity(user, r.targetType, r.targetId);
      if (!summary) continue;
      const type = r.targetType as LawLinkTarget;
      out.push({ id: r.id, targetType: type, targetId: r.targetId, typeLabel: LAW_LINK_TARGET_LABELS[type] ?? r.targetType, label: summary.label, href: summary.href, context: r.context, createdAt: r.createdAt.toISOString() });
    }
    return out;
  },

  async followUps(user: CurrentUser, requirementId: string): Promise<LawFollowUpDto[]> {
    await loadVisibleRequirement(prisma, user, requirementId);
    const rows = await prisma.recordLink.findMany({ where: { sourceType: REQUIREMENT_ENTITY, sourceId: requirementId }, orderBy: { createdAt: "asc" } });
    const out: LawFollowUpDto[] = [];
    for (const r of rows) {
      if (!(await canViewEntity(user, r.targetType, r.targetId))) continue;
      const status = await followUpStatus(r.targetType, r.targetId);
      out.push({ id: r.id, kind: r.kind === "incident" ? "incident" : "action", label: status.label, href: status.href, resolved: status.resolved, createdAt: r.createdAt.toISOString() });
    }
    return out;
  },

  /** Records of the profile's site the user may open, for the "Link a record" picker. */
  async linkOptions(user: CurrentUser, requirementId: string, targetType: LawLinkTarget, q?: string): Promise<LawLinkOptionDto[]> {
    const row = await loadVisibleRequirement(prisma, user, requirementId);
    requireModule(user, targetType);
    const siteId = row.profile.siteId;
    const text = q?.trim();
    const linked = new Set((await prisma.lawLink.findMany({ where: { requirementId, targetType }, select: { targetId: true } })).map((l) => l.targetId));
    if (targetType === "RiskAssessment") {
      const rows = await prisma.riskAssessment.findMany({
        where: { AND: [assessmentVisibleWhere(user), { siteId, archivedAt: null }, text ? { OR: [{ reference: { contains: text, mode: "insensitive" } }, { title: { contains: text, mode: "insensitive" } }] } : {}] },
        select: { id: true, reference: true, title: true, status: true },
        orderBy: { reference: "desc" },
        take: 20,
      });
      return rows.filter((r) => !linked.has(r.id)).map((r) => ({ id: r.id, label: `${r.reference} · ${r.title}`, detail: r.status.replace(/_/g, " ").toLowerCase() }));
    }
    if (targetType === "Incident") {
      const rows = await prisma.incident.findMany({
        where: { AND: [incidentVisibleWhere(user), { siteId, archivedAt: null }, text ? { OR: [{ reference: { contains: text, mode: "insensitive" } }, { title: { contains: text, mode: "insensitive" } }] } : {}] },
        select: { id: true, reference: true, title: true, typeLabel: true, status: true },
        orderBy: { reference: "desc" },
        take: 20,
      });
      return rows.filter((r) => !linked.has(r.id)).map((r) => ({ id: r.id, label: `${r.reference} · ${r.title}`, detail: `${r.typeLabel} · ${r.status.replace(/_/g, " ").toLowerCase()}` }));
    }
    const rows = await prisma.correctiveAction.findMany({
      where: { AND: [actionVisibleWhere(user), { siteId, archivedAt: null }, text ? { OR: [{ reference: { contains: text, mode: "insensitive" } }, { description: { contains: text, mode: "insensitive" } }] } : {}] },
      select: { id: true, reference: true, description: true, state: true },
      orderBy: { reference: "desc" },
      take: 20,
    });
    return rows.filter((r) => !linked.has(r.id)).map((r) => ({ id: r.id, label: `${r.reference} · ${r.description.slice(0, 120)}`, detail: r.state.replace(/_/g, " ").toLowerCase() }));
  },

  /** Explicit association (idempotent: linking the same record again returns the existing link). */
  async link(user: CurrentUser, requirementId: string, input: LawLinkCreateInput, meta: RequestMeta): Promise<{ id: string; created: boolean }> {
    const row = await loadVisibleRequirement(prisma, user, requirementId);
    if (!canEvaluate(user, requirementFacts(row))) throw new ForbiddenError("You cannot link records to this requirement.");
    assertEditable(row, "The record cannot be linked");
    const gates = linkBlockers(input);
    if (gates.length) blocked("The record cannot be linked", gates);
    requireModule(user, input.targetType);
    const targetId = input.targetId!;
    if (!(await canViewEntity(user, input.targetType, targetId))) throw new NotFoundError();
    const target = await targetSite(input.targetType, targetId);
    if (!target) throw new NotFoundError();
    if (target.siteId !== row.profile.siteId) blocked("The record cannot be linked", ["Choose a record from this profile's site."]);
    const existing = await prisma.lawLink.findUnique({ where: { organizationId_requirementId_targetType_targetId: { organizationId: requireTenantId(), requirementId, targetType: input.targetType, targetId } } });
    if (existing) return { id: existing.id, created: false };
    const label = (await describeEntity(user, input.targetType, targetId))?.label ?? targetId;
    try {
      return await prisma.$transaction(async (tx) => {
        const link = await tx.lawLink.create({
          data: { organizationId: requireTenantId(), requirementId, targetType: input.targetType, targetId, context: input.context.trim(), createdById: user.id },
          select: { id: true },
        });
        await recordAudit(
          { entityType: REQUIREMENT_ENTITY, entityId: requirementId, action: LAW_AUDIT.LINKED, actor: user, metadata: { targetType: input.targetType, targetId, label, context: input.context.trim() }, meta },
          tx,
        );
        return { id: link.id, created: true };
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      const winner = await prisma.lawLink.findFirst({ where: { requirementId, targetType: input.targetType, targetId }, select: { id: true } });
      if (!winner) throw error;
      return { id: winner.id, created: false };
    }
  },

  async unlink(user: CurrentUser, requirementId: string, linkId: string, meta: RequestMeta): Promise<void> {
    const row = await loadVisibleRequirement(prisma, user, requirementId);
    if (!canEvaluate(user, requirementFacts(row))) throw new ForbiddenError();
    const link = await prisma.lawLink.findFirst({ where: { id: linkId, requirementId } });
    if (!link) throw new NotFoundError();
    const label = (await describeEntity(user, link.targetType, link.targetId))?.label ?? link.targetId;
    await prisma.$transaction(async (tx) => {
      await tx.lawLink.delete({ where: { id: link.id } });
      await recordAudit(
        { entityType: REQUIREMENT_ENTITY, entityId: requirementId, action: LAW_AUDIT.UNLINKED, actor: user, metadata: { targetType: link.targetType, targetId: link.targetId, label, context: link.context }, meta },
        tx,
      );
    });
  },

  /** Is "Raise incident" possible right now (type + published Report form configured)? */
  async incidentReadiness(user: CurrentUser) {
    if (!user.enabledModules.includes("incidents")) return { ready: false, problem: "The Incidents module is not enabled for your company.", typeName: null, formName: null, fixable: false };
    return nonComplianceReadiness(prisma, requireTenantId());
  },

  /**
   * Non Compliance incident draft (one per requirement – repeating returns it). Needs a department
   * in the profile's site; the draft keeps the legal source and is completed in Incident.
   */
  async raiseIncident(user: CurrentUser, requirementId: string, input: LawRaiseIncidentInput, meta: RequestMeta): Promise<{ incidentId: string; reference: string; created: boolean; isDraft: boolean }> {
    const row = await loadVisibleRequirement(prisma, user, requirementId);
    if (!canEvaluate(user, requirementFacts(row))) throw new ForbiddenError("You cannot raise follow-ups from this requirement.");
    assertEditable(row, "The incident cannot be raised");
    const readiness = await this.incidentReadiness(user);
    if (!readiness.ready) blocked("The incident cannot be raised", [`${readiness.problem} Ask an administrator to set it up in Configuration → Law content & settings.`]);
    if (!input.departmentId) blocked("The incident cannot be raised", ["Choose a department in this profile's site."]);
    await assertDepartmentAtSite(prisma, input.departmentId, row.profile.siteId);
    if (input.ownerId) await assertActiveUser(prisma, input.ownerId, "the investigator");
    const narrative = [input.note.trim(), `Raised from the legal requirement ${row.reference} “${row.title}” in the profile ${row.profile.name}.`].filter(Boolean).join("\n\n");
    return prisma.$transaction(async (tx) => {
      const result = await raiseIncidentDraft(tx, user, {
        typeKey: NON_COMPLIANCE_KEY,
        subtypeLabel: row.kind === "OTHER" ? NON_COMPLIANCE_SUBTYPES.OTHER : NON_COMPLIANCE_SUBTYPES.CONTENT,
        title: `Compliance gap · ${row.title}`,
        narrative,
        placement: { businessUnitId: null, siteId: null, locationId: null, departmentId: input.departmentId },
        ownerId: input.ownerId,
        source: source(row, ""),
      });
      if (result.created) {
        await recordAudit(
          { entityType: REQUIREMENT_ENTITY, entityId: requirementId, action: LAW_AUDIT.INCIDENT_RAISED, actor: user, metadata: { incidentId: result.incidentId, reference: result.reference, draft: result.isDraft }, meta },
          tx,
        );
      }
      return result;
    });
  },

  /** Corrective action with legal provenance – no incident needed. Repeated submits of one dialog return the same action. */
  async raiseAction(user: CurrentUser, requirementId: string, input: LawRaiseActionInput, meta: RequestMeta): Promise<{ actionId: string; reference: string; created: boolean }> {
    const row = await loadVisibleRequirement(prisma, user, requirementId);
    if (!canEvaluate(user, requirementFacts(row))) throw new ForbiddenError("You cannot raise follow-ups from this requirement.");
    assertEditable(row, "The action cannot be raised");
    if (!user.enabledModules.includes("incidents")) blocked("The action cannot be raised", ["Corrective actions live in the Incidents module, which is not enabled for your company."]);
    const gates = raiseActionBlockers({ ...input, today: todayFor(user.timeZone) });
    if (gates.length) blocked("The action cannot be raised", gates);
    await assertDepartmentAtSite(prisma, input.departmentId!, row.profile.siteId);
    return prisma.$transaction(async (tx) => {
      const result = await raiseAction(tx, user, {
        kind: "corrective-action",
        description: input.description.trim(),
        ownerId: input.ownerId!,
        dueDate: input.dueDate!,
        placement: { businessUnitId: null, siteId: null, locationId: null, departmentId: input.departmentId },
        source: source(row, `action:${input.requestKey}`),
      });
      if (result.created) {
        await recordAudit(
          { entityType: REQUIREMENT_ENTITY, entityId: requirementId, action: LAW_AUDIT.ACTION_RAISED, actor: user, metadata: { actionId: result.actionId, reference: result.reference, description: input.description.trim() }, meta },
          tx,
        );
      }
      return result;
    });
  },

  /** Requirements linked to (or that raised) a Risk assessment / Incident / Incident action – the back-link card. */
  async connections(user: CurrentUser, entityType: LawLinkTarget, entityId: string): Promise<LawConnectionDto[]> {
    await requireEntityAccess(user, entityType, entityId, "view");
    if (!user.enabledModules.includes("law")) return [];
    const [links, raised] = await Promise.all([
      prisma.lawLink.findMany({ where: { targetType: entityType, targetId: entityId }, select: { requirementId: true, context: true } }),
      prisma.recordLink.findMany({ where: { targetType: entityType, targetId: entityId, sourceType: REQUIREMENT_ENTITY }, select: { sourceId: true } }),
    ]);
    const ids = [...new Set([...links.map((l) => l.requirementId), ...raised.map((r) => r.sourceId)])];
    if (!ids.length) return [];
    const rows = await prisma.lawRequirement.findMany({
      where: { AND: [{ id: { in: ids } }, requirementVisibleWhere(user)] },
      select: { id: true, reference: true, title: true, profile: { select: { name: true } } },
    });
    const out: LawConnectionDto[] = [];
    for (const r of rows) {
      const base = { requirementId: r.id, reference: r.reference, title: r.title, profileName: r.profile.name, href: requirementHref(r.id) };
      for (const l of links.filter((x) => x.requirementId === r.id)) out.push({ ...base, how: "linked", context: l.context });
      if (raised.some((x) => x.sourceId === r.id)) out.push({ ...base, how: "raised", context: "" });
    }
    return out;
  },
};
