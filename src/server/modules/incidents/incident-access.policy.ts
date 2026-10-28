import type { Prisma } from "@/generated/prisma/client";
import { PERMISSIONS as P, type Permission } from "@/lib/permissions";
import { grantsCover, type PermissionGrants, type Placement } from "@/lib/scope";
import { scopeWhere } from "@/server/auth/authorization";
import { anonymousReporterKey } from "./anonymous-reporter";

/**
 * Incident & action visibility and record-level rights – Specification pattern (pure, tested).
 *
 * The same `where` fragments drive registers, detail reads, evidence/comments access and exports,
 * so a user can never open a record they could not list (out-of-scope → 404).
 *
 * Incidents: in the scope of `incident.view`, OR reported by me, OR I am an assigned investigator.
 * "Reported by me" also covers my anonymous reports (matched by `anonymousReporterKey`, never by id).
 * Confidential incidents hide people, narrative and answers unless the viewer holds
 * `incident.view_confidential` at the incident's placement, reported it or investigates it.
 * Actions: in the scope of `incident.action.view`, OR I own / review it / own one of its tasks,
 * OR it is linked to an incident I can see.
 */

export interface IncidentPrincipal {
  id: string;
  permissions: Permission[];
  grants: PermissionGrants;
}

function isCompanyWide(where: Record<string, unknown> | null): boolean {
  return where !== null && Object.keys(where).length === 0;
}

/** Reports I made – under my name or anonymously. */
export function reportedByWhere(user: Pick<IncidentPrincipal, "id">): Prisma.IncidentWhereInput[] {
  return [{ reporterId: user.id }, { anonymousReporterKey: anonymousReporterKey(user.id) }];
}

export function incidentVisibleWhere(user: IncidentPrincipal): Prisma.IncidentWhereInput {
  const scope = scopeWhere(user, P.INCIDENT_VIEW);
  if (isCompanyWide(scope)) return {};
  const or: Prisma.IncidentWhereInput[] = [...reportedByWhere(user), { investigators: { some: { userId: user.id } } }];
  if (scope) or.unshift(scope as Prisma.IncidentWhereInput);
  return { OR: or };
}

/** Incidents whose confidential details (people, narrative, answers) the user may read. */
export function confidentialVisibleWhere(user: IncidentPrincipal): Prisma.IncidentWhereInput {
  const scope = scopeWhere(user, P.INCIDENT_VIEW_CONFIDENTIAL);
  if (isCompanyWide(scope)) return {};
  const or: Prisma.IncidentWhereInput[] = [{ isConfidential: false }, ...reportedByWhere(user), { investigators: { some: { userId: user.id } } }];
  if (scope) or.push(scope as Prisma.IncidentWhereInput);
  return { OR: or };
}

export function actionVisibleWhere(user: IncidentPrincipal): Prisma.CorrectiveActionWhereInput {
  const scope = scopeWhere(user, P.INCIDENT_ACTION_VIEW);
  if (isCompanyWide(scope)) return {};
  const or: Prisma.CorrectiveActionWhereInput[] = [
    { ownerId: user.id },
    { reviewerId: user.id },
    { tasks: { some: { ownerId: user.id } } },
    { incidents: { some: { incident: incidentVisibleWhere(user) } } },
  ];
  if (scope) or.unshift(scope as Prisma.CorrectiveActionWhereInput);
  return { OR: or };
}

// ── Record-level rights (single record already loaded and visible) ──────────

export interface IncidentRecordFacts extends Placement {
  /** Null on anonymous reports. */
  reporterId: string | null;
  isAnonymous: boolean;
  anonymousReporterKey: string | null;
  investigatorIds: readonly string[];
  isDraft: boolean;
  isConfidential: boolean;
  closed: boolean;
  archived: boolean;
}

const at = (user: IncidentPrincipal, permission: Permission, placement: Placement) => grantsCover(user.grants, permission, placement);

/** I made this report (under my name or anonymously). */
export function isReporter(user: Pick<IncidentPrincipal, "id">, i: Pick<IncidentRecordFacts, "reporterId" | "anonymousReporterKey">): boolean {
  return i.reporterId === user.id || (i.anonymousReporterKey !== null && i.anonymousReporterKey === anonymousReporterKey(user.id));
}

/**
 * I am acting on my own anonymous report only as its reporter (not as a triager): what I do must not
 * name me – the audit records "Anonymous reporter" without an IP address.
 */
export function actsAsAnonymousReporter(user: IncidentPrincipal, i: IncidentRecordFacts): boolean {
  return i.isAnonymous && isReporter(user, i) && !isTriager(user, i);
}

export function canSeeConfidential(user: IncidentPrincipal, i: IncidentRecordFacts): boolean {
  return !i.isConfidential || isReporter(user, i) || i.investigatorIds.includes(user.id) || at(user, P.INCIDENT_VIEW_CONFIDENTIAL, i);
}

export function isTriager(user: IncidentPrincipal, i: Placement): boolean {
  return at(user, P.INCIDENT_TRIAGE, i);
}

/** Ordinary report editing: the reporter while it is a draft, triagers any time – never when closed/archived. */
export function canEditReport(user: IncidentPrincipal, i: IncidentRecordFacts): boolean {
  if (i.closed || i.archived) return false;
  return (i.isDraft && isReporter(user, i)) || isTriager(user, i);
}

export function canSubmitReport(user: IncidentPrincipal, i: IncidentRecordFacts): boolean {
  return i.isDraft && !i.archived && (isReporter(user, i) || isTriager(user, i));
}

export function canArchiveIncident(user: IncidentPrincipal, i: IncidentRecordFacts): boolean {
  return isTriager(user, i) || at(user, P.INCIDENT_CLOSE, i) || (i.isDraft && isReporter(user, i));
}

/**
 * Adding evidence (files, links) to the report: whoever may edit it, investigators and the reporter.
 * The evidence list names who added each item, so the reporter of an anonymous report adds files
 * only in the report itself (stored without a name) – unless they also triage or investigate it.
 */
export function canAddReportEvidence(user: IncidentPrincipal, i: IncidentRecordFacts): boolean {
  if (i.closed || i.archived) return false;
  if (i.isAnonymous && isReporter(user, i) && !isTriager(user, i) && !canInvestigate(user, i)) return false;
  return canEditReport(user, i) || canInvestigate(user, i) || isReporter(user, i);
}

export function canInvestigate(user: IncidentPrincipal, i: IncidentRecordFacts): boolean {
  if (i.archived) return false;
  return i.investigatorIds.includes(user.id) || at(user, P.INCIDENT_INVESTIGATE, i);
}

export function canCloseIncident(user: IncidentPrincipal, i: IncidentRecordFacts): boolean {
  return !i.archived && at(user, P.INCIDENT_CLOSE, i);
}

export function canRaiseAction(user: IncidentPrincipal, i: IncidentRecordFacts): boolean {
  return !i.archived && !i.isDraft && (at(user, P.INCIDENT_ACTION_CREATE, i) || i.investigatorIds.includes(user.id));
}

export interface ActionRecordFacts extends Placement {
  ownerId: string;
  reviewerId: string | null;
}

/** Managers (assign permission at the action's placement) can act on anyone's action without changing its owner. */
export function canManageAction(user: IncidentPrincipal, a: Placement): boolean {
  return at(user, P.INCIDENT_ACTION_ASSIGN, a);
}

export function canEditAction(user: IncidentPrincipal, a: ActionRecordFacts): boolean {
  return canManageAction(user, a) || at(user, P.INCIDENT_ACTION_CREATE, a);
}

export function canWorkOnAction(user: IncidentPrincipal, a: ActionRecordFacts): boolean {
  return (a.ownerId === user.id && user.permissions.includes(P.INCIDENT_ACTION_COMPLETE)) || canManageAction(user, a);
}

/** The named reviewer, or anyone holding the verify permission at the action's placement. */
export function canReviewAction(user: IncidentPrincipal, a: ActionRecordFacts): boolean {
  return a.reviewerId === user.id || at(user, P.INCIDENT_ACTION_VERIFY, a);
}

export function canCompleteTask(user: IncidentPrincipal, a: ActionRecordFacts, task: { ownerId: string }): boolean {
  return task.ownerId === user.id || canWorkOnAction(user, a);
}
