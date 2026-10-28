/**
 * Response shapes of the Documents API. Framework-free so client code can `import type`
 * them. All dates are ISO strings.
 */
import type { Paginated } from "@/lib/validation/common";
import type { AcknowledgementSource, DocumentStatusValue, EscalationTargetValue } from "@/lib/validation/documents";
import type { MyAckStatus } from "./acknowledgement-rules";
import type { MySurveySummaryDto, SurveySummaryDto } from "./survey.dto";

export type { MyAckStatus };

export interface NamedRef {
  id: string;
  name: string;
}

export interface CategoryDto extends NamedRef {
  documentCount: number;
}

export interface TagDto extends NamedRef {
  /** Documents (not surveys) carrying the tag – within the scope asked for. */
  documentCount: number;
}

export interface VersionSummaryDto {
  id: string;
  versionNumber: number;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  changeNote: string | null;
  createdAt: string;
}

export interface VersionHistoryItem extends VersionSummaryDto {
  requiresReacknowledgement: boolean;
  isCurrent: boolean;
  uploadedBy: NamedRef;
  acknowledgementCount: number;
}

export interface AcknowledgementReceiptDto {
  id: string;
  versionId: string;
  versionNumber: number;
  acknowledgedAt: string;
  clientAcknowledgedAt: string | null;
  source: string;
  statement: string;
}

export interface MyDocumentItem {
  id: string;
  title: string;
  description: string | null;
  referenceCode: string | null;
  category: NamedRef | null;
  /** Sorted by name. */
  tags: NamedRef[];
  status: DocumentStatusValue;
  currentVersion: VersionSummaryDto | null;
  publishedAt: string | null;
  updatedAt: string;
  requiresAcknowledgement: boolean;
  ackStatus: MyAckStatus;
  dueAt: string | null;
  /** Latest acknowledgement satisfying the current requirement. */
  acknowledgement: AcknowledgementReceiptDto | null;
  /** The reader's status for the document's current survey (null = no survey). */
  survey: MySurveySummaryDto | null;
}

export interface MyDocumentsSummary {
  total: number;
  /** Acknowledgements still to give. */
  outstanding: number;
  /** Acknowledgements overdue. */
  overdue: number;
  acknowledged: number;
  /** Mandatory surveys still to answer. */
  surveysToAnswer: number;
  /** Documents needing something from me (acknowledgement and/or mandatory survey) – "Action required" / "To do". */
  actionRequired: number;
  /** Documents with an overdue acknowledgement or survey. */
  actionOverdue: number;
}

export interface MyDocumentsResponse extends Paginated<MyDocumentItem> {
  summary: MyDocumentsSummary;
}

export interface MySurveysSummary {
  total: number;
  /** Open surveys I haven't answered (mandatory or optional) plus acknowledgements still to give. */
  toAnswer: number;
  /** Overdue mandatory surveys or acknowledgements. */
  overdue: number;
  answered: number;
}

export interface MySurveysResponse extends Paginated<MyDocumentItem> {
  summary: MySurveysSummary;
}

export interface DocumentViewerDto extends MyDocumentItem {
  /** The user is in the document's audience (as opposed to seeing it via view-all). */
  assigned: boolean;
  /** The user has opened/downloaded the current version (required before acknowledging). */
  openedCurrentVersion: boolean;
  requiredVersionNumber: number | null;
  statement: string;
  /** Created on the Survey page – listed in My Surveys rather than My Documents. */
  isSurvey: boolean;
}

export interface AudienceSummaryDto {
  allEmployees: boolean;
  roles: NamedRef[];
  businessUnits: NamedRef[];
  sites: NamedRef[];
  locations: NamedRef[];
  departments: NamedRef[];
  users: (NamedRef & { email: string })[];
}

export interface ComplianceStats {
  required: number;
  acknowledged: number;
  outstanding: number;
  overdue: number;
  percent: number;
  requiredVersionNumber: number | null;
  requiredSince: string | null;
  ackDueDays: number;
}

export interface LibraryItem {
  id: string;
  title: string;
  referenceCode: string | null;
  category: NamedRef | null;
  /** Sorted by name. */
  tags: NamedRef[];
  status: DocumentStatusValue;
  currentVersion: VersionSummaryDto | null;
  audience: AudienceSummaryDto;
  requiresAcknowledgement: boolean;
  compliance: ComplianceStats | null;
  /** Current survey ("Survey · 12 answers"), null when none. */
  survey: SurveySummaryDto | null;
  publishedAt: string | null;
  archivedAt: string | null;
  updatedAt: string;
}

export interface ManageDocumentDto extends LibraryItem {
  description: string | null;
  ackRequiredFromVersion: number | null;
  ackDueDays: number | null;
  reminderIntervalDays: number | null;
  escalationDays: number | null;
  escalationTarget: EscalationTargetValue;
  createdBy: NamedRef;
  createdAt: string;
  versionCount: number;
}

export interface AckReportRow {
  userId: string;
  name: string;
  email: string;
  employeeNumber: string | null;
  jobTitle: string | null;
  department: NamedRef | null;
  location: NamedRef | null;
  acknowledgement: {
    id: string;
    versionNumber: number;
    acknowledgedAt: string;
    clientAcknowledgedAt: string | null;
    source: AcknowledgementSource | string;
  } | null;
  dueAt: string | null;
  overdue: boolean;
  remindersSent: number;
  lastRemindedAt: string | null;
  escalatedAt: string | null;
}

export interface ComplianceSummaryItem {
  id: string;
  title: string;
  category: NamedRef | null;
  stats: ComplianceStats;
}

export interface ComplianceSummaryResponse {
  items: ComplianceSummaryItem[];
  totals: { documents: number; required: number; acknowledged: number; outstanding: number; overdue: number };
}

export interface DocumentAuditEntry {
  id: string;
  entityType: string;
  action: string;
  actorName: string | null;
  changes: unknown;
  metadata: unknown;
  createdAt: string;
}

export interface CreatedDocumentDto {
  id: string;
  status: DocumentStatusValue;
  notified: number;
  surveyId: string | null;
}
