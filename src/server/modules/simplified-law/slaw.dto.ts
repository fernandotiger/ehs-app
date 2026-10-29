import type { AnswerKey, ApplicabilityKey, ComplianceKey, LegalStatusKey, SlawActionStatusKey, StatusLabels } from "@/lib/simplified-law";
import type { NextStep, Progress, RegisterStep, RequirementCounts } from "@/lib/simplified-law/rules";

/** Simplified law – shapes returned by the API (dates as ISO strings / yyyy-mm-dd). */

export interface NamedRef {
  id: string;
  name: string;
}

export interface SlawSettingsDto {
  registerTitle: string;
  jurisdictions: string[];
  statusLabels: StatusLabels;
  hideRepealed: boolean;
  defaultActionDays: number;
  /** 0 = defaults, not saved yet. */
  version: number;
}

export interface SlawSummaryDto {
  laws: number;
  applies: number;
  notChecked: number;
  notCompliant: number;
  openActions: number;
  overdueActions: number;
  myOpenActions: number;
}

export interface SlawCategoryNode {
  id: string;
  name: string;
  description: string;
  archived: boolean;
  /** Laws listed under it (sub-categories) or under its sub-categories (categories); archived laws excluded. */
  legislationCount: number;
  /** Jurisdiction → number of laws. */
  jurisdictions: Record<string, number>;
  children: SlawCategoryNode[];
}

export interface SlawLegislationListItem {
  id: string;
  title: string;
  shortTitle: string;
  reference: string;
  jurisdiction: string;
  status: LegalStatusKey;
  kindLabel: string;
  relationNote: string;
  summary: string;
  officialUrl: string | null;
  category: NamedRef;
  parentCategory: NamedRef | null;
  applicability: ApplicabilityKey;
  counts: RequirementCounts;
  progress: Progress;
  archived: boolean;
  /** Your own law (not from the demo library). */
  custom: boolean;
}

export interface SlawArticleDto {
  id: string;
  chapter: string;
  number: string;
  title: string;
  appliesFrom: string | null;
  appliesTo: string[];
}

export interface SlawQuestionDto {
  id: string;
  text: string;
  answer: AnswerKey | null;
  reason: string;
  answeredBy: NamedRef | null;
  answeredAt: string | null;
}

export interface SlawActionDto {
  text: string;
  owner: NamedRef | null;
  dueDate: string | null;
  status: SlawActionStatusKey;
  overdue: boolean;
  setBy: NamedRef | null;
  completedAt: string | null;
  completedBy: NamedRef | null;
  note: string;
}

export interface SlawRequirementDto {
  id: string;
  section: string;
  text: string;
  articles: string;
  compliance: ComplianceKey;
  reason: string;
  assessedBy: NamedRef | null;
  assessedAt: string | null;
  action: SlawActionDto;
  /** Not compliant and its action is done – look at it again. */
  recheck: boolean;
  version: number;
}

export interface SlawLegislationDetailDto extends SlawLegislationListItem {
  guidanceUrl: string | null;
  applicabilityReason: string;
  applicabilityBy: NamedRef | null;
  applicabilityAt: string | null;
  version: number;
  articles: SlawArticleDto[];
  /** Columns of the overview ("who it applies to"). */
  roles: string[];
  questions: SlawQuestionDto[];
  requirements: SlawRequirementDto[];
  nextStep: NextStep;
  steps: RegisterStep[];
  rights: { assess: boolean; manage: boolean };
  updatedAt: string;
}

export interface SlawActionItem {
  requirementId: string;
  legislationId: string;
  lawTitle: string;
  requirementText: string;
  section: string;
  articles: string;
  compliance: ComplianceKey;
  gap: string;
  action: SlawActionDto;
  mine: boolean;
  canComplete: boolean;
  /** May open the law in the register. */
  canOpenLaw: boolean;
  /** Done, but the requirement is still marked not compliant – look at it again. */
  recheck: boolean;
  version: number;
}

export interface SlawActionSummaryDto {
  mine: number;
  overdue: number;
  dueSoon: number;
  open: number;
}

export interface SlawHistoryEntry {
  id: string;
  action: string;
  actorName: string | null;
  changes: unknown;
  metadata: unknown;
  createdAt: string;
  /** The requirement an entry is about (requirement entries). */
  subject: string | null;
}
