import "server-only";
import type { CurrentUser } from "@/server/auth/current-user";
import { ForbiddenError, NotFoundError } from "@/server/http/errors";
import { actionEntity } from "@/server/modules/actions/action.entity";
import { documentEntity } from "@/server/modules/documents/document.entity";
import { actionTaskEntity, correctiveActionEntity, incidentEntity, investigationEntity } from "@/server/modules/incidents/incident.entity";
import { riskAssessmentEntity, riskObjectiveEntity, riskProgrammeEntity, riskTaskEntity } from "@/server/modules/risk/risk.entity";
import type { EntityDescriptor, EntitySummary } from "./types";

export type { EntityDescriptor, EntityRef, EntitySummary } from "./types";

/**
 * Entity registry: entityType → descriptor. Modules add their entries here by import
 * (e.g. `Incident: incidentEntity`). Shared services (evidence, comments, record links) use it to
 * decide access and to render labels/links for records of any module.
 */
const ENTITIES: Record<string, EntityDescriptor> = {
  Document: documentEntity,
  Incident: incidentEntity,
  Investigation: investigationEntity,
  CorrectiveAction: correctiveActionEntity,
  ActionTask: actionTaskEntity,
  RiskAssessment: riskAssessmentEntity,
  RiskTask: riskTaskEntity,
  RiskProgramme: riskProgrammeEntity,
  RiskObjective: riskObjectiveEntity,
  Action: actionEntity,
};

export function getEntity(entityType: string): EntityDescriptor | null {
  return Object.prototype.hasOwnProperty.call(ENTITIES, entityType) ? ENTITIES[entityType]! : null;
}

export function isRegisteredEntity(entityType: string): boolean {
  return getEntity(entityType) !== null;
}

function enabled(user: CurrentUser, descriptor: EntityDescriptor): boolean {
  return !descriptor.module || user.enabledModules.includes(descriptor.module);
}

export async function canViewEntity(user: CurrentUser, entityType: string, entityId: string): Promise<boolean> {
  const descriptor = getEntity(entityType);
  if (!descriptor || !enabled(user, descriptor)) return false;
  return descriptor.canView(user, entityId);
}

export async function canEditEntity(user: CurrentUser, entityType: string, entityId: string): Promise<boolean> {
  const descriptor = getEntity(entityType);
  if (!descriptor || !enabled(user, descriptor)) return false;
  return (await descriptor.canView(user, entityId)) && descriptor.canEdit(user, entityId);
}

/**
 * Throws NotFoundError when the user may not see the record (existence is not leaked) and
 * ForbiddenError when they may see but not change it.
 */
export async function requireEntityAccess(user: CurrentUser, entityType: string, entityId: string, mode: "view" | "edit"): Promise<void> {
  if (!(await canViewEntity(user, entityType, entityId))) throw new NotFoundError();
  if (mode === "edit" && !(await canEditEntity(user, entityType, entityId))) throw new ForbiddenError();
}

/** Label + link for a record the user may view; null otherwise. */
export async function describeEntity(user: CurrentUser, entityType: string, entityId: string): Promise<EntitySummary | null> {
  const descriptor = getEntity(entityType);
  if (!descriptor || !(await canViewEntity(user, entityType, entityId))) return null;
  const label = await descriptor.label(entityId);
  if (label === null) return null;
  return { entityType, entityId, label, href: descriptor.href(entityId) };
}
