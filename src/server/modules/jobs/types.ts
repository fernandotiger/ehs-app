/**
 * Due-work contract between modules and the jobs engine / My work. Pure types (no server-only),
 * so the engine and its tests can import them.
 */
import type { DueWorkKind } from "@/lib/jobs";
import type { ModuleKey } from "@/lib/modules";
import type { Placement } from "@/lib/scope";
import type { CurrentUser } from "@/server/auth/current-user";

export type { DueWorkKind } from "@/lib/jobs";

/** One open piece of work with a due date. */
export interface DueWorkItem {
  provider: DueWorkKind;
  entityType: string;
  entityId: string;
  /** Reference shown to people, e.g. "INC-2026-0004". */
  reference?: string;
  title: string;
  /** In-app link to the record. */
  href: string;
  /** Local calendar date the work is due (yyyy-mm-dd). */
  dueDate: string;
  /** The record's owner (assignee). */
  ownerId: string | null;
  /** Where the record sits; scope and role coverage are resolved through it. */
  placement: Placement;
  /**
   * When set, the person responsible for the CURRENT step (e.g. the effectiveness reviewer of an
   * action awaiting effectiveness). Reminders go to this person instead of the owner and
   * `dueDate` must be that step's date. My work shows the item to both.
   */
  reviewerId?: string | null;
}

export interface DueWorkProvider {
  kind: DueWorkKind;
  module: ModuleKey;
  label: string;
  /** Selectable as a scheduled-job target (false = My work only). */
  jobTarget: boolean;
  /** Every open item of this kind in the CURRENT tenant (runs inside the tenant context). */
  listOpen(): Promise<DueWorkItem[]>;
  /** Optional fast path for My work; default = listOpen() filtered by owner/reviewer. */
  listForUser?(user: CurrentUser): Promise<DueWorkItem[]>;
}
