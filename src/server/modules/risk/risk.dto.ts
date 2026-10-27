import type { FormValues, QuestionnaireSnapshot } from "@/lib/forms";
import type { RiskFormSettings } from "@/lib/forms/settings";
import type { AssessmentStatus, ChecklistResultKey, ProgrammeStatus, RevisionAction, StrategyStatus, TargetDirection, TaskKind, TaskStatus } from "@/lib/risk/labels";
import type { RiskBand, RiskMethod } from "@/lib/risk/scoring";
import type { AssessmentNextStep, LifecycleStage } from "./workflow";

/** Risk module DTOs (dates as yyyy-mm-dd or ISO strings). Shared with the client through features/risk/api.ts. */

export interface NamedRefDto {
  id: string;
  name: string;
}

export interface PlacementDto {
  businessUnitId: string | null;
  siteId: string | null;
  locationId: string | null;
  departmentId: string | null;
  siteName: string | null;
  locationName: string | null;
  departmentName: string | null;
}

export interface HazardSnapshot {
  id: string;
  activity: string;
  name: string;
  consequence: string;
  controls: string;
  recommendation: string | null;
  justification: string;
  likelihood: number | null;
  severity: number | null;
  factors: Record<string, number> | null;
  checklistResult: ChecklistResultKey | null;
  score: number | null;
}

export interface HazardDto extends HazardSnapshot {
  band: RiskBand | null;
  openTasks: number;
}

export interface RevisionDto {
  id: string;
  revision: number;
  date: string;
  action: RevisionAction;
  comment: string | null;
  score: number | null;
  band: RiskBand | null;
  hazards: HazardSnapshot[];
  taskId: string | null;
  taskReference: string | null;
  actorName: string | null;
}

export interface ReviewDto {
  id: string;
  reviewDate: string;
  comment: string;
  nextReviewDate: string;
  reviewerName: string | null;
  revision: number;
  score: number | null;
  createdAt: string;
}

export interface AssessmentListItem {
  id: string;
  reference: string;
  title: string;
  status: AssessmentStatus;
  method: RiskMethod;
  domain: string;
  score: number | null;
  band: RiskBand | null;
  revision: number;
  reviewDate: string | null;
  reviewOverdue: boolean;
  reviewDue: boolean;
  owner: NamedRefDto | null;
  siteName: string | null;
  departmentName: string | null;
  hazardCount: number;
  /** null when the viewer may not see the confidential flag. */
  isConfidential: boolean | null;
  updatedAt: string;
}

export interface RelatedAssessmentDto {
  id: string;
  reference: string;
  title: string;
  status: AssessmentStatus;
  score: number | null;
  band: RiskBand | null;
}

export interface AssessmentPermissions {
  edit: boolean;
  submit: boolean;
  approve: boolean;
  review: boolean;
  revise: boolean;
  archive: boolean;
  restore: boolean;
  clone: boolean;
  createTask: boolean;
  addEvidence: boolean;
  link: boolean;
  seeConfidential: boolean;
}

export interface AssessmentDetailDto {
  id: string;
  reference: string;
  labelId: string;
  version: number;
  title: string;
  description: string | null;
  status: AssessmentStatus;
  revision: number;
  method: RiskMethod;
  domain: string;
  rules: RiskFormSettings;
  form: Pick<QuestionnaireSnapshot, "formId" | "versionId" | "version" | "name" | "fields" | "siteId" | "capturedAt">;
  answers: FormValues;
  placement: PlacementDto;
  owner: NamedRefDto | null;
  approver: NamedRefDto | null;
  participants: NamedRefDto[];
  reviewDate: string | null;
  itemType: string | null;
  itemIdentity: string | null;
  operationMode: string | null;
  workArea: string | null;
  peopleExposed: string | null;
  impactContext: string | null;
  score: number | null;
  band: RiskBand | null;
  isConfidential: boolean | null;
  hazards: HazardDto[];
  revisions: RevisionDto[];
  reviews: ReviewDto[];
  related: RelatedAssessmentDto[];
  clonedFrom: { id: string; reference: string } | null;
  tasks: TaskListItem[];
  submittedAt: string | null;
  approvedAt: string | null;
  approvedByName: string | null;
  lastReviewedAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  today: string;
  reviewOverdue: boolean;
  reviewDue: boolean;
  nextStep: AssessmentNextStep;
  lifecycle: LifecycleStage[];
  submitBlockers: string[];
  permissions: AssessmentPermissions;
}

export interface TaskListItem {
  id: string;
  reference: string;
  kind: TaskKind;
  title: string;
  status: TaskStatus;
  owner: NamedRefDto;
  createdOn: string;
  dueDate: string;
  overdue: boolean;
  completedOn: string | null;
  programme: { id: string; title: string };
  assessment: { id: string; reference: string; title: string } | null;
  hazard: { id: string; name: string } | null;
  parentId: string | null;
  parentReference: string | null;
  subTaskCount: number;
  openSubTasks: number;
  factor: string | null;
  factorLabel: string | null;
  originalValue: number | null;
  targetValue: number | null;
  actualValue: number | null;
  siteName: string | null;
}

export interface TaskDetailDto extends TaskListItem {
  version: number;
  info: string | null;
  completionComment: string | null;
  completedByName: string | null;
  parent: { id: string; reference: string; title: string; status: TaskStatus } | null;
  subTasks: TaskListItem[];
  /** Completed siblings / all siblings (sub-tasks of the same parent). */
  siblingProgress: { completed: number; total: number } | null;
  scoring: boolean;
  factorRange: { label: string; min: number; max: number } | null;
  assessmentStatus: AssessmentStatus | null;
  assessmentMethod: RiskMethod | null;
  today: string;
  permissions: { edit: boolean; work: boolean; addSubTask: boolean };
}

export interface ObjectiveDto {
  id: string;
  title: string;
  domain: string | null;
  placement: PlacementDto;
  owner: NamedRefDto;
  deadline: string;
  description: string | null;
  status: StrategyStatus;
  version: number;
  overdue: boolean;
  targetCount: number;
  programmeCount: number;
  /** Average target progress (0 without targets). */
  progress: number;
  permissions: { edit: boolean };
}

export interface TargetDto {
  id: string;
  objective: { id: string; title: string };
  title: string;
  owner: NamedRefDto;
  deadline: string;
  direction: TargetDirection;
  unit: string;
  baseline: number;
  current: number;
  goal: number;
  progress: number;
  goalReached: boolean;
  status: StrategyStatus;
  version: number;
  overdue: boolean;
  programmeCount: number;
  siteName: string | null;
  permissions: { edit: boolean };
}

export interface ProgrammeDto {
  id: string;
  objective: { id: string; title: string };
  title: string;
  targets: { id: string; title: string; progress: number }[];
  placement: PlacementDto;
  owner: NamedRefDto;
  startDate: string;
  deadline: string;
  means: string | null;
  budget: number | null;
  status: ProgrammeStatus;
  version: number;
  progress: number;
  taskCount: number;
  openTasks: number;
  overdue: boolean;
  permissions: { edit: boolean; createTask: boolean };
}

export interface ObjectiveDetailDto extends ObjectiveDto {
  targets: TargetDto[];
  programmes: ProgrammeDto[];
}

export interface TargetDetailDto extends TargetDto {
  programmes: ProgrammeDto[];
}

export interface ProgrammeDetailDto extends ProgrammeDto {
  tasks: TaskListItem[];
}

export interface AttentionItem {
  kind: "review-overdue" | "review-due" | "approval" | "task-overdue" | "draft";
  id: string;
  reference: string;
  title: string;
  detail: string;
  due: string | null;
  href: string;
}

export interface RiskOverviewDto {
  today: string;
  counts: {
    active: number;
    highCritical: number;
    reviewsDue: number;
    reviewsOverdue: number;
    awaitingApproval: number;
    drafts: number;
    openTasks: number;
    overdueTasks: number;
    objectives: number;
    programmes: number;
  };
  byBand: { label: string; value: number }[];
  needsAttention: AttentionItem[];
  recent: AssessmentListItem[];
  programmes: { id: string; title: string; progress: number; deadline: string; overdue: boolean }[];
}

export interface RiskReportResultDto {
  key: string;
  title: string;
  dateMeaning: string;
  period: { from: string | null; to: string | null; siteName: string | null };
  chart: { label: string; value: number }[];
  columns: string[];
  rows: (string | number | null)[][];
  notes: string[];
}

export interface RiskFormRulesDto {
  id: string;
  name: string;
  method: RiskMethod;
  domain: string;
  status: "DRAFT" | "PUBLISHED";
  currentVersion: number;
  settings: RiskFormSettings | null;
  assessmentCount: number;
}

export interface ScanResultDto {
  id: string;
  reference: string;
  title: string;
  status: AssessmentStatus;
  /** Approved: the periodic review opens. */
  review: boolean;
  href: string;
}
