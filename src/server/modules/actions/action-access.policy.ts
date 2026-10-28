import type { Prisma } from "@/generated/prisma/client";
import type { ActionStatusKey } from "@/lib/actions";
import { PERMISSIONS as P, type Permission } from "@/lib/permissions";
import { grantsCover, type PermissionGrants, type Placement } from "@/lib/scope";
import { scopeWhere } from "@/server/auth/authorization";

/**
 * Standalone action visibility and record-level rights – Specification pattern (pure, tested).
 *
 * The same `where` drives My Actions, the detail page, history and the evidence / comments
 * registry, so an action outside the user's reach is simply not found (404).
 *
 *  - See: `action.view` in scope, OR I own the action, OR I created it.
 *  - Create: `action.create` covering the chosen department (anywhere when no department).
 *  - Start / complete: the owner, or `action.manage` at the placement (a manager completes on the
 *    owner's behalf without changing the owner).
 *  - Edit / cancel / reopen: the creator, or `action.manage` at the placement.
 */

export interface ActionPrincipal {
  id: string;
  permissions: Permission[];
  grants: PermissionGrants;
}

export interface ActionRecordFacts extends Placement {
  ownerId: string;
  createdById: string;
  status: ActionStatusKey;
}

const active = (status: ActionStatusKey) => status === "OPEN" || status === "IN_PROGRESS";

export function actionVisibleWhere(user: ActionPrincipal): Prisma.ActionWhereInput {
  const scope = scopeWhere(user, P.ACTION_VIEW);
  if (scope !== null && Object.keys(scope).length === 0) return {};
  const or: Prisma.ActionWhereInput[] = [{ ownerId: user.id }, { createdById: user.id }];
  if (scope) or.unshift(scope as Prisma.ActionWhereInput);
  return { OR: or };
}

export function canCreateActionAt(user: ActionPrincipal, placement: Placement | null): boolean {
  if (!placement || !placement.departmentId) return user.permissions.includes(P.ACTION_CREATE);
  return grantsCover(user.grants, P.ACTION_CREATE, placement);
}

export function canManageAction(user: ActionPrincipal, placement: Placement): boolean {
  return grantsCover(user.grants, P.ACTION_MANAGE, placement);
}

export function canWorkOnAction(user: ActionPrincipal, a: ActionRecordFacts): boolean {
  return active(a.status) && (a.ownerId === user.id || canManageAction(user, a));
}

export function canEditAction(user: ActionPrincipal, a: ActionRecordFacts): boolean {
  return active(a.status) && (a.createdById === user.id || canManageAction(user, a));
}

export function canCancelAction(user: ActionPrincipal, a: ActionRecordFacts): boolean {
  return canEditAction(user, a);
}

export function canReopenAction(user: ActionPrincipal, a: ActionRecordFacts): boolean {
  return !active(a.status) && (a.createdById === user.id || canManageAction(user, a));
}

/** Choosing someone else as owner on edit needs the creator or a manager (same as editing). */
export function actionRights(user: ActionPrincipal, a: ActionRecordFacts) {
  return {
    edit: canEditAction(user, a),
    work: canWorkOnAction(user, a),
    cancel: canCancelAction(user, a),
    reopen: canReopenAction(user, a),
  };
}
