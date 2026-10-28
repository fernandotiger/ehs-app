import type { QuestionnaireSnapshot, FormValues } from "@/lib/forms";
import type { EvaluationStatusKey, LawLevel, LawTaskPriorityKey, LawTaskStatusKey } from "@/lib/law";
import type { NonComplianceReadiness } from "./incident-type";
import type { ComplianceSummary, LifecycleStep, RequirementStep } from "./workflow";

/** Law API DTOs (dates as yyyy-mm-dd, timestamps as ISO strings). */

export interface NamedRefDto {
  id: string;
  name: string;
}

export interface LawProfileListItem {
  id: string;
  name: string;
  site: NamedRefDto | null;
  owner: NamedRefDto;
  jurisdiction: string;
  activities: string[];
  isShared: boolean;
  showRating: boolean;
  contentVersion: string;
  /** A newer library version is installed and not yet accepted. */
  updateAvailable: string | null;
  archived: boolean;
  summary: ComplianceSummary;
  overdueTasks: number;
}

export interface LawProfileDetailDto extends LawProfileListItem {
  description: string;
  version: number;
  businessUnitId: string | null;
  siteId: string | null;
  createdAt: string;
  permissions: { edit: boolean; manage: boolean; addRequirement: boolean };
  /** Jurisdictions the accepted library covers (edit form). */
  jurisdictions: string[];
}

export interface LawRequirementListItem {
  id: string;
  reference: string;
  kind: "CONTENT" | "OTHER";
  contentKey: string | null;
  title: string;
  register: string;
  category: string;
  status: EvaluationStatusKey;
  inScope: boolean;
  reviewOverdue: boolean;
  owner: NamedRefDto | null;
  departmentName: string | null;
  nextReviewDate: string | null;
  evaluatedOn: string | null;
  rating: number | null;
  openTasks: number;
  profile: { id: string; name: string; showRating: boolean };
}

export interface LawRequirementPage {
  items: LawRequirementListItem[];
  total: number;
  page: number;
  pageSize: number;
  profile: { id: string; name: string; contentVersion: string; showRating: boolean } | null;
  /** Category choices present in this profile. */
  categories: string[];
}

export interface LawLegislationRef {
  id: string;
  title: string;
  reference: string;
  level: LawLevel;
  sourceUrl: string;
  active: boolean;
}

export interface LawRequirementDetailDto extends LawRequirementListItem {
  version: number;
  requirementText: string;
  keywords: string[];
  legislation: LawLegislationRef[];
  isRelevant: boolean;
  exclusionReason: string | null;
  relevanceNotes: string;
  evaluationNotes: string;
  ownerId: string | null;
  departmentId: string | null;
  siteId: string | null;
  reviewRequired: boolean;
  reviewReason: string | null;
  archived: boolean;
  profileArchived: boolean;
  profileSiteName: string | null;
  contentVersion: string;
  form: QuestionnaireSnapshot | null;
  answers: FormValues;
  today: string;
  missing: string[];
  lifecycle: LifecycleStep[];
  nextStep: RequirementStep | null;
  permissions: { evaluate: boolean; confirmReview: boolean; editRequirement: boolean; evidence: boolean; openProfile: boolean };
  incidentReadiness: NonComplianceReadiness;
  /** Modules the follow-ups / links need. */
  modules: { risk: boolean; incidents: boolean };
}

export interface LawHistoryEntry {
  id: string;
  action: string;
  actorName: string | null;
  changes: unknown;
  metadata: unknown;
  createdAt: string;
}

export interface LawAttentionItem {
  kind: "review-required" | "review-overdue" | "task-overdue" | "update-available" | "not-started";
  label: string;
  detail: string;
  href: string;
}

export interface LawOverviewDto {
  profiles: { id: string; name: string; siteName: string | null }[];
  profile: LawProfileListItem | null;
  upcomingReviews: number;
  attention: LawAttentionItem[];
  recent: { id: string; reference: string; title: string; status: EvaluationStatusKey; evaluatedOn: string | null; href: string }[];
  canCreateProfile: boolean;
  libraryInstalled: boolean;
}

export interface LawLegislationListItem extends LawLegislationRef {
  jurisdiction: string;
  domain: string;
  category: string;
  synopsis: string;
  keywords: string[];
  parentId: string;
  /** Requirements of the selected profile that refer to it. */
  requirementCount: number;
}

export interface LawLegislationPage {
  items: LawLegislationListItem[];
  total: number;
  page: number;
  pageSize: number;
  contentVersion: string | null;
  profile: { id: string; name: string } | null;
}

export interface LawLegislationDetailDto extends LawLegislationListItem {
  contentVersion: string;
  parent: LawLegislationRef | null;
  children: LawLegislationRef[];
  checklists: { id: string; title: string; requirementId: string | null; requirementReference: string | null; applies: boolean }[];
  riskAssessments: { label: string; href: string; context: string }[];
  history: { version: string; change: "NEW" | "AMENDED"; releasedOn: string }[];
  profile: { id: string; name: string } | null;
}

export interface LawTaskListItem {
  id: string;
  reference: string;
  title: string;
  status: LawTaskStatusKey;
  priority: LawTaskPriorityKey;
  owner: NamedRefDto;
  dueDate: string;
  overdue: boolean;
  archived: boolean;
  completedOn: string | null;
  departmentName: string | null;
  requirement: { id: string; reference: string; title: string; register: string; category: string };
  profile: { id: string; name: string };
  assignedToMe: boolean;
}

export interface LawTaskDetailDto extends LawTaskListItem {
  details: string;
  version: number;
  departmentId: string | null;
  siteId: string | null;
  createdBy: NamedRefDto;
  createdOn: string;
  completedByName: string | null;
  completionNotes: string | null;
  today: string;
  permissions: { work: boolean; edit: boolean; archive: boolean; restore: boolean };
}

export interface LawTaskSummaryDto {
  mine: number;
  overdue: number;
  dueSoon: number;
  reviewsDue: number;
}

