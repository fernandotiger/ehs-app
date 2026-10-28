import type { Prisma } from "@/generated/prisma/client";
import type { LawTaskStatusKey } from "@/lib/law";
import { PERMISSIONS as P, type Permission } from "@/lib/permissions";
import { grantsCover, hasCompanyWide, type PermissionGrants, type Placement } from "@/lib/scope";
import { scopeWhere } from "@/server/auth/authorization";

/**
 * Law visibility and record-level rights – Specification pattern (pure, tested).
 *
 * The same `where` drives the registers, the detail pages, history and the evidence / comments
 * registry, so a record outside the user's reach is simply not found (404).
 *
 *  - Profiles: `law.view` in scope on SHARED profiles, `law.requirement.manage` in scope (private
 *    ones too) or the profile owner.
 *  - Requirements: the same, checked on the requirement's own placement (its department, or the
 *    profile's site), plus the requirement's responsible owner and owners of its tasks.
 *  - Tasks: whoever sees the requirement, plus the task owner and its creator.
 *  - Evaluate / add tasks / link records / raise follow-ups: `law.evaluation.create` at the
 *    requirement, or the requirement owner, or the profile owner.
 *  - Confirm a content-change review: `law.evaluation.approve` at the requirement, or the owners.
 *  - Profiles and company requirements: `law.requirement.manage` at the site (the profile owner may
 *    edit their own profile); installing content packages needs it company-wide.
 */

export interface LawPrincipal {
  id: string;
  permissions: Permission[];
  grants: PermissionGrants;
}

const isAll = (where: Record<string, unknown> | null) => where !== null && Object.keys(where).length === 0;

export function profileVisibleWhere(user: LawPrincipal): Prisma.LawProfileWhereInput {
  const view = scopeWhere(user, P.LAW_VIEW);
  const manage = scopeWhere(user, P.LAW_REQUIREMENT_MANAGE);
  if (isAll(manage)) return {};
  const or: Prisma.LawProfileWhereInput[] = [{ ownerId: user.id }];
  if (view) or.push(isAll(view) ? { isShared: true } : { AND: [view as Prisma.LawProfileWhereInput, { isShared: true }] });
  if (manage) or.push(manage as Prisma.LawProfileWhereInput);
  return { OR: or };
}

export function requirementVisibleWhere(user: LawPrincipal): Prisma.LawRequirementWhereInput {
  const view = scopeWhere(user, P.LAW_VIEW);
  const manage = scopeWhere(user, P.LAW_REQUIREMENT_MANAGE);
  if (isAll(manage)) return {};
  // Task owners may open the requirement behind their task (read-only unless they may evaluate).
  const or: Prisma.LawRequirementWhereInput[] = [{ ownerId: user.id }, { profile: { ownerId: user.id } }, { tasks: { some: { ownerId: user.id } } }];
  if (view) or.push(isAll(view) ? { profile: { isShared: true } } : { AND: [view as Prisma.LawRequirementWhereInput, { profile: { isShared: true } }] });
  if (manage) or.push(manage as Prisma.LawRequirementWhereInput);
  return { OR: or };
}

export function taskVisibleWhere(user: LawPrincipal): Prisma.LawTaskWhereInput {
  const requirement = requirementVisibleWhere(user);
  if (Object.keys(requirement).length === 0) return {};
  return { OR: [{ ownerId: user.id }, { createdById: user.id }, { requirement }] };
}

export interface RequirementRecordFacts extends Placement {
  ownerId: string | null;
  profileOwnerId: string;
}

export function canManageLawAt(user: LawPrincipal, placement: Placement): boolean {
  return grantsCover(user.grants, P.LAW_REQUIREMENT_MANAGE, placement);
}

/** Install / preview legal-content packages (company-wide library). */
export function canInstallContent(user: LawPrincipal): boolean {
  return hasCompanyWide(user.grants, P.LAW_REQUIREMENT_MANAGE);
}

export function canEditProfile(user: LawPrincipal, p: Placement & { ownerId: string }): boolean {
  return p.ownerId === user.id || canManageLawAt(user, p);
}

export function canEvaluate(user: LawPrincipal, r: RequirementRecordFacts): boolean {
  return r.ownerId === user.id || r.profileOwnerId === user.id || grantsCover(user.grants, P.LAW_EVALUATION_CREATE, r);
}

export function canConfirmReview(user: LawPrincipal, r: RequirementRecordFacts): boolean {
  return r.ownerId === user.id || r.profileOwnerId === user.id || grantsCover(user.grants, P.LAW_EVALUATION_APPROVE, r);
}

export interface LawTaskRecordFacts extends Placement {
  ownerId: string;
  createdById: string;
  status: LawTaskStatusKey;
  archived: boolean;
}

const evaluator = (user: LawPrincipal, t: Placement) => grantsCover(user.grants, P.LAW_EVALUATION_CREATE, t);

/** Complete: the owner, or an evaluator on the owner's behalf (the owner stays the owner). */
export function canWorkOnTask(user: LawPrincipal, t: LawTaskRecordFacts): boolean {
  return !t.archived && t.status === "OPEN" && (t.ownerId === user.id || evaluator(user, t));
}

export function canEditTask(user: LawPrincipal, t: LawTaskRecordFacts): boolean {
  return !t.archived && t.status === "OPEN" && (t.createdById === user.id || evaluator(user, t));
}

export function canArchiveTask(user: LawPrincipal, t: LawTaskRecordFacts): boolean {
  return t.createdById === user.id || evaluator(user, t);
}

export function taskRights(user: LawPrincipal, t: LawTaskRecordFacts) {
  return {
    work: canWorkOnTask(user, t),
    edit: canEditTask(user, t),
    archive: !t.archived && canArchiveTask(user, t),
    restore: t.archived && canArchiveTask(user, t),
  };
}
