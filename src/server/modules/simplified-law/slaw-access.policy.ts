import type { Prisma } from "@/generated/prisma/client";
import { PERMISSIONS as P, type Permission } from "@/lib/permissions";
import type { SlawActionStatusKey } from "@/lib/simplified-law";

/**
 * Simplified law access – Specification pattern (pure, tested).
 *
 * The register is company-wide (the storyboard asks "is it applicable to the company?"), so a
 * permission counts wherever it is held:
 *  - See the register: `slaw.view`, `slaw.assess` or `slaw.manage`.
 *  - Answer the applicability questions, assess requirements and set actions: `slaw.assess`.
 *  - Simplified law → Configuration (categories, legislation, questions, requirements, lists): `slaw.manage`.
 *  - Actions: everyone sees and completes the actions they own (no register access needed);
 *    `slaw.assess` completes anyone's action on the owner's behalf without changing the owner.
 * Records outside a person's reach are simply not found (404).
 */

export interface SlawPrincipal {
  id: string;
  permissions: readonly Permission[];
}

export function canViewRegister(user: SlawPrincipal): boolean {
  return user.permissions.includes(P.SLAW_VIEW) || user.permissions.includes(P.SLAW_ASSESS) || user.permissions.includes(P.SLAW_MANAGE);
}

export function canAssess(user: SlawPrincipal): boolean {
  return user.permissions.includes(P.SLAW_ASSESS);
}

export function canManage(user: SlawPrincipal): boolean {
  return user.permissions.includes(P.SLAW_MANAGE);
}

/** Requirement rows carrying an action (open or done) the person may see in "Actions to do". */
export function actionVisibleWhere(user: SlawPrincipal): Prisma.SlawRequirementWhereInput {
  const base: Prisma.SlawRequirementWhereInput = { actionStatus: { in: ["OPEN", "DONE"] }, archivedAt: null, legislation: { archivedAt: null } };
  return canViewRegister(user) ? base : { ...base, actionOwnerId: user.id };
}

export function canCompleteAction(user: SlawPrincipal, row: { actionStatus: SlawActionStatusKey; actionOwnerId: string | null }): boolean {
  return row.actionStatus === "OPEN" && (row.actionOwnerId === user.id || canAssess(user));
}
