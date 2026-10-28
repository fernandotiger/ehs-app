import type { ActionPriorityKey, ActionStatusKey } from "@/lib/actions";
import type { FormValues, QuestionnaireSnapshot } from "@/lib/forms";
import type { ActionCommand, LifecycleStep } from "./workflow";

/** Shapes returned by /api/actions (dates as yyyy-mm-dd or ISO strings). */

export interface NamedRefDto {
  id: string;
  name: string;
}

export interface ActionListItem {
  id: string;
  reference: string;
  title: string;
  status: ActionStatusKey;
  priority: ActionPriorityKey;
  owner: NamedRefDto;
  createdBy: NamedRefDto;
  dueDate: string;
  overdue: boolean;
  completedOn: string | null;
  /** "Dublin Plant · Engineering" or null for the whole company. */
  placeLabel: string | null;
  /** I am the owner (assigned to me). */
  assignedToMe: boolean;
  createdByMe: boolean;
  updatedAt: string;
}

export interface ActionSummaryDto {
  /** Open work assigned to me. */
  assigned: number;
  /** Open work assigned to me and overdue. */
  overdue: number;
  /** Open work assigned to me, due within the next 7 days (today included). */
  dueSoon: number;
  /** Open work I created for other people. */
  createdForOthers: number;
}

export interface ActionDetailDto extends ActionListItem {
  description: string;
  version: number;
  createdAt: string;
  createdOn: string;
  startedAt: string | null;
  completedByName: string | null;
  completionNotes: string | null;
  cancelledAt: string | null;
  cancelledByName: string | null;
  cancelReason: string | null;
  placement: { businessUnitId: string | null; siteId: string | null; locationId: string | null; departmentId: string | null };
  departmentName: string | null;
  siteName: string | null;
  /** Captured extra questions (Form Builder) and their answers, if a form was used. */
  form: QuestionnaireSnapshot | null;
  answers: FormValues;
  today: string;
  lifecycle: LifecycleStep[];
  /** The ONE primary button for this viewer, or null. */
  nextStep: ActionCommand | null;
  permissions: { edit: boolean; work: boolean; cancel: boolean; reopen: boolean; evidence: boolean };
}

export interface ActionHistoryEntry {
  id: string;
  action: string;
  actorName: string | null;
  changes: unknown;
  metadata: unknown;
  createdAt: string;
}
