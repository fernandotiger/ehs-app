import type { Prisma } from "@/generated/prisma/client";
import { PERMISSIONS as P, type Permission } from "@/lib/permissions";
import { grantsCover, hasCompanyWide, type PermissionGrants, type Placement } from "@/lib/scope";
import { scopeWhere } from "@/server/auth/authorization";

/**
 * Risk visibility and record-level rights – Specification pattern (pure, tested).
 *
 * The same `where` fragments drive registers, detail reads, exports, reports and the evidence /
 * comments registry, so a record outside the user's reach is simply not found (404).
 *
 *  - Assessments: `risk.view` in scope, OR I am the responsible owner, the approver or a participant.
 *  - Tasks: `risk.task.view` in scope, OR I own the task.
 *  - Objectives / programmes: `risk.view` in scope, OR I own them. Targets: their objective is
 *    visible, OR I own the target.
 * Administrators (company-wide grants) act on others' work without changing the owner.
 */

export interface RiskPrincipal {
  id: string;
  permissions: Permission[];
  grants: PermissionGrants;
}

function isCompanyWide(where: Record<string, unknown> | null): boolean {
  return where !== null && Object.keys(where).length === 0;
}

const at = (user: RiskPrincipal, permission: Permission, placement: Placement) => grantsCover(user.grants, permission, placement);

export function assessmentVisibleWhere(user: RiskPrincipal): Prisma.RiskAssessmentWhereInput {
  const scope = scopeWhere(user, P.RISK_VIEW);
  if (isCompanyWide(scope)) return {};
  const or: Prisma.RiskAssessmentWhereInput[] = [{ ownerId: user.id }, { approverId: user.id }, { participantIds: { has: user.id } }];
  if (scope) or.unshift(scope as Prisma.RiskAssessmentWhereInput);
  return { OR: or };
}

export function taskVisibleWhere(user: RiskPrincipal): Prisma.RiskTaskWhereInput {
  const scope = scopeWhere(user, P.RISK_TASK_VIEW);
  if (isCompanyWide(scope)) return {};
  const or: Prisma.RiskTaskWhereInput[] = [{ ownerId: user.id }];
  if (scope) or.unshift(scope as Prisma.RiskTaskWhereInput);
  return { OR: or };
}

export function objectiveVisibleWhere(user: RiskPrincipal): Prisma.RiskObjectiveWhereInput {
  const scope = scopeWhere(user, P.RISK_VIEW);
  if (isCompanyWide(scope)) return {};
  const or: Prisma.RiskObjectiveWhereInput[] = [{ ownerId: user.id }];
  if (scope) or.unshift(scope as Prisma.RiskObjectiveWhereInput);
  return { OR: or };
}

export function targetVisibleWhere(user: RiskPrincipal): Prisma.RiskTargetWhereInput {
  const objective = objectiveVisibleWhere(user);
  if (Object.keys(objective).length === 0) return {};
  return { OR: [{ ownerId: user.id }, { objective }] };
}

export function programmeVisibleWhere(user: RiskPrincipal): Prisma.RiskProgrammeWhereInput {
  const scope = scopeWhere(user, P.RISK_VIEW);
  if (isCompanyWide(scope)) return {};
  const or: Prisma.RiskProgrammeWhereInput[] = [{ ownerId: user.id }];
  if (scope) or.unshift(scope as Prisma.RiskProgrammeWhereInput);
  return { OR: or };
}

// ── Assessment rights (record already loaded and visible) ──────────────────

export interface AssessmentRecordFacts extends Placement {
  ownerId: string | null;
  approverId: string | null;
  createdById: string | null;
  status: "DRAFT" | "AWAITING_APPROVAL" | "APPROVED" | "ARCHIVED";
}

/** Create at a department: `risk.create` covering it (anywhere when no department yet). */
export function canCreateAssessmentAt(user: RiskPrincipal, placement: Placement | null): boolean {
  if (!placement || !placement.departmentId) return user.permissions.includes(P.RISK_CREATE);
  return at(user, P.RISK_CREATE, placement);
}

/** Change content: `risk.edit` at the placement, or the author/owner of a Draft who may create assessments. */
export function canEditAssessment(user: RiskPrincipal, a: AssessmentRecordFacts): boolean {
  if (at(user, P.RISK_EDIT, a)) return true;
  return a.status === "DRAFT" && (a.createdById === user.id || a.ownerId === user.id) && user.permissions.includes(P.RISK_CREATE);
}

/** Approve: `risk.approve` at the placement, or the named approver holding `risk.approve`. */
export function canApproveAssessment(user: RiskPrincipal, a: AssessmentRecordFacts): boolean {
  return at(user, P.RISK_APPROVE, a) || (a.approverId === user.id && user.permissions.includes(P.RISK_APPROVE));
}

/** Periodic review: the responsible owner, or `risk.approve` at the placement ("confirm periodic reviews"). */
export function canReviewAssessment(user: RiskPrincipal, a: AssessmentRecordFacts): boolean {
  return a.ownerId === user.id || at(user, P.RISK_APPROVE, a);
}

export function canArchiveAssessment(user: RiskPrincipal, a: AssessmentRecordFacts): boolean {
  return at(user, P.RISK_EDIT, a);
}

/** Baseline: the confidential flag is an administrator-visible marker (company-wide `risk.configure`). */
export function seesConfidentialFlag(user: RiskPrincipal): boolean {
  return hasCompanyWide(user.grants, P.RISK_CONFIGURE);
}

// ── Task rights ─────────────────────────────────────────────────────────────

export interface TaskRecordFacts extends Placement {
  ownerId: string;
}

export function canCreateTaskAt(user: RiskPrincipal, placement: Placement): boolean {
  return at(user, P.RISK_TASK_CREATE, placement);
}

/** Managers (assign at the placement) act on anyone's task without changing its owner. */
export function canManageTask(user: RiskPrincipal, t: Placement): boolean {
  return at(user, P.RISK_TASK_ASSIGN, t);
}

export function canEditTask(user: RiskPrincipal, t: TaskRecordFacts): boolean {
  return canManageTask(user, t) || at(user, P.RISK_TASK_CREATE, t);
}

/** Start / complete: the owner (with `risk.task.complete`) or a manager at the placement. */
export function canWorkOnTask(user: RiskPrincipal, t: TaskRecordFacts): boolean {
  return (t.ownerId === user.id && user.permissions.includes(P.RISK_TASK_COMPLETE)) || canManageTask(user, t);
}

// ── Strategy rights ─────────────────────────────────────────────────────────

export function canCreateStrategyAt(user: RiskPrincipal, placement: Placement): boolean {
  return at(user, P.RISK_CREATE, placement);
}

/** Edit objectives/targets/programmes: `risk.edit` at the placement, or the owner (e.g. recording measurements). */
export function canEditStrategy(user: RiskPrincipal, record: Placement & { ownerId: string }): boolean {
  return at(user, P.RISK_EDIT, record) || record.ownerId === user.id;
}
