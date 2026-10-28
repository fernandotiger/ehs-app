/**
 * Read models of the Incident module (imported as types by the client). Dates are ISO strings;
 * date-only values are "yyyy-mm-dd".
 */
import type { FormValues, QuestionnaireSnapshot } from "@/lib/forms";
import type {
  ActionKindKey,
  ActionStateKey,
  CauseGroupKey,
  DurationUnitKey,
  IncidentStatusKey,
  InvestigationStatusKey,
  InvolvementKey,
  PersonTypeKey,
  PriorityKey,
  ReporteeKindKey,
  Severity,
} from "@/lib/incidents";
import type { IncidentNextStep, LifecycleStage, TrendCriteria } from "./workflow";

export interface NamedRef {
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

export interface SourceDto {
  type: string;
  id: string;
  key: string | null;
  label: string;
  href: string | null;
}

export interface IncidentListItem {
  id: string;
  reference: string;
  title: string;
  typeLabel: string;
  subtypeLabel: string | null;
  severity: Severity;
  status: IncidentStatusKey;
  occurredAt: string | null;
  submittedAt: string | null;
  siteName: string | null;
  departmentName: string | null;
  /** Null when reported anonymously. */
  reporter: NamedRef | null;
  isAnonymous: boolean;
  investigators: NamedRef[];
  investigationStatus: InvestigationStatusKey | null;
  investigationTargetDate: string | null;
  /** Target date passed and the investigation is not completed. */
  investigationOverdue: boolean;
  isConfidential: boolean;
  archived: boolean;
  openActions: number;
  totalActions: number;
  updatedAt: string;
}

export interface PersonDto {
  id: string;
  name: string;
  userId: string | null;
  personType: PersonTypeKey;
  involvement: InvolvementKey;
  injuryDetails: string | null;
  injuryType: string | null;
  bodyPart: string | null;
}

export interface CauseDto {
  id: string;
  label: string;
  group: CauseGroupKey;
  isActive: boolean;
}

export interface ReporteeDto {
  id: string;
  label: string;
  kind: ReporteeKindKey;
  destination: string | null;
  isActive: boolean;
}

export interface AbsenceDto {
  id: string;
  startDate: string;
  endDate: string;
  kind: string;
  restricted: boolean;
  note: string | null;
  /** Inclusive calendar days (0 for Restricted duties). */
  days: number;
}

export interface InvestigationDto {
  id: string;
  version: number;
  status: InvestigationStatusKey;
  investigator: NamedRef | null;
  form: QuestionnaireSnapshot | null;
  answers: FormValues;
  hiddenAnswerKeys: string[];
  healthSafetyImpact: boolean;
  hazardGroup: string | null;
  environmentalImpact: boolean;
  environmentalAspect: string | null;
  environmentalDescription: string | null;
  environmentalDuration: number | null;
  environmentalDurationUnit: DurationUnitKey | null;
  causes: CauseDto[];
  reportable: boolean;
  reportees: ReporteeDto[];
  absences: AbsenceDto[];
  daysLost: number;
  operatingHoursLost: number | null;
  actionsRequired: boolean | null;
  closingDecision: string | null;
  startedAt: string;
  completedAt: string | null;
  completedBy: NamedRef | null;
  /** What completion still needs (empty = can complete). */
  completionBlockers: string[];
}

export interface ActionSummaryDto {
  id: string;
  reference: string;
  description: string;
  kind: ActionKindKey;
  state: ActionStateKey;
  owner: NamedRef;
  reviewer: NamedRef | null;
  dueDate: string;
  plannedReviewDate: string | null;
  priority: PriorityKey;
  overdue: boolean;
  /** Effective, or ineffective with every applicable follow-up resolved. */
  resolved: boolean;
  parentActionId: string | null;
  taskCount: number;
  tasksDone: number;
  incidentCount: number;
  siteName: string | null;
  departmentName: string | null;
  source: SourceDto | null;
}

export interface IncidentPermissionsDto {
  edit: boolean;
  submit: boolean;
  archive: boolean;
  investigate: boolean;
  close: boolean;
  raiseAction: boolean;
  seeConfidential: boolean;
  addEvidence: boolean;
}

export interface IncidentDetailDto {
  id: string;
  reference: string;
  version: number;
  title: string;
  /** null when hidden (confidential) or not given. */
  narrative: string | null;
  confidentialHidden: boolean;
  type: {
    id: string;
    key: string;
    name: string;
    isActive: boolean;
    investigationEnabled: boolean;
    investigationRequired: boolean;
    multipleInvestigators: boolean;
    assignmentRequired: boolean;
    attachmentsAllowed: boolean;
    targetDays: number;
  };
  typeLabel: string;
  subtype: { id: string | null; label: string } | null;
  severity: Severity;
  status: IncidentStatusKey;
  placement: PlacementDto;
  preciseLocation: string | null;
  shift: string | null;
  occurredAt: string | null;
  investigationTargetDate: string | null;
  isConfidential: boolean;
  isDraft: boolean;
  submittedAt: string | null;
  /** Null when reported anonymously – nobody (not even admins) sees who reported it. */
  reporter: NamedRef | null;
  isAnonymous: boolean;
  /** The viewer made this report (under their name or anonymously) – only ever told to the reporter. */
  reportedByMe: boolean;
  immediateAction: string | null;
  firstAid: string | null;
  nurseNotified: boolean;
  notifyUsers: NamedRef[];
  investigators: NamedRef[];
  people: PersonDto[];
  reportForm: QuestionnaireSnapshot | null;
  answers: FormValues;
  hiddenAnswerKeys: string[];
  closedAt: string | null;
  closedBy: NamedRef | null;
  closureNote: string | null;
  archivedAt: string | null;
  source: SourceDto | null;
  createdAt: string;
  updatedAt: string;
  investigation: InvestigationDto | null;
  actions: ActionSummaryDto[];
  daysLost: number;
  lifecycle: LifecycleStage[];
  nextStep: IncidentNextStep;
  /** Closure gates (without the note). */
  closureBlockers: string[];
  /** Submission gates while Draft. */
  submitBlockers: string[];
  permissions: IncidentPermissionsDto;
}

export interface TaskDto {
  id: string;
  actionId: string;
  title: string;
  owner: NamedRef;
  departmentId: string | null;
  departmentName: string | null;
  dueDate: string;
  priority: PriorityKey;
  done: boolean;
  completionComment: string | null;
  completedAt: string | null;
  completedBy: NamedRef | null;
  overdue: boolean;
  canComplete: boolean;
  canEdit: boolean;
}

export interface TaskListItem extends TaskDto {
  action: { id: string; reference: string; description: string; state: ActionStateKey };
  siteName: string | null;
}

export interface FollowUpNode {
  id: string;
  reference: string;
  description: string;
  state: ActionStateKey;
  resolved: boolean;
  children: FollowUpNode[];
}

export interface TrendSnapshotDto {
  criteria: TrendCriteria & { labels?: Record<string, string> };
  matched: { id: string; reference: string }[];
  capturedAt: string;
}

export interface ActionDetailDto extends ActionSummaryDto {
  version: number;
  capaCategory: string | null;
  placement: PlacementDto;
  completionComment: string | null;
  completedAt: string | null;
  completedBy: NamedRef | null;
  reviewComment: string | null;
  reviewedAt: string | null;
  reviewedBy: NamedRef | null;
  trend: TrendSnapshotDto | null;
  incidents: { id: string; reference: string; title: string; status: IncidentStatusKey }[];
  tasks: TaskDto[];
  parent: { id: string; reference: string; description: string; state: ActionStateKey } | null;
  followUps: FollowUpNode[];
  createdBy: NamedRef | null;
  createdAt: string;
  /** Company-local today (yyyy-mm-dd) used for the review gate. */
  today: string;
  completionBlockers: string[];
  /** Review gates without the comment. */
  reviewBlockers: string[];
  permissions: { edit: boolean; work: boolean; review: boolean; followUp: boolean; link: boolean; addTask: boolean };
}

export interface ReportResultDto {
  key: string;
  title: string;
  period: { from: string; to: string; siteName: string | null };
  /** Chart-friendly summary rows. */
  chart: { label: string; value: number }[];
  columns: string[];
  rows: (string | number | null)[][];
  /** Notes such as "Restricted duties are not counted". */
  notes: string[];
}

export interface IncidentOverviewDto {
  today: string;
  counts: { open: number; overdueInvestigations: number; openActions: number; pendingReviews: number; drafts: number };
  needsAttention: { kind: "investigation" | "action" | "review" | "draft" | "close"; id: string; href: string; reference: string; title: string; detail: string; due: string | null }[];
  recent: IncidentListItem[];
  charts: {
    byStatus: { label: string; value: number }[];
    byType: { label: string; value: number }[];
    bySeverity: { label: string; value: number }[];
    byMonth: { label: string; value: number }[];
  };
}

export interface TrendPreviewDto {
  criteria: TrendCriteria;
  matches: { id: string; reference: string; title: string; occurredAt: string | null; typeLabel: string; subtypeLabel: string | null; severity: Severity; departmentName: string | null }[];
  summary: { byType: { label: string; value: number }[]; bySeverity: { label: string; value: number }[]; byDepartment: { label: string; value: number }[]; byCause: { label: string; value: number }[] };
}
