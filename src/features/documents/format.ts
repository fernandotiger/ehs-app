import { format, formatDistanceToNowStrict, isValid, parseISO } from "date-fns";
import type { BadgeTone } from "@/components/common/status-badge";
import type { DocumentStatusValue, EscalationTargetValue } from "@/lib/validation/documents";
import type { AudienceSummaryDto } from "@/server/modules/documents/document.dto";

/** Presentation helpers for the Documents module (dates arrive as ISO strings). */

export function formatDate(iso: string | null | undefined, pattern = "d MMM yyyy"): string {
  if (!iso) return "—";
  const date = parseISO(iso);
  return isValid(date) ? format(date, pattern) : "—";
}

export function formatDateTime(iso: string | null | undefined): string {
  return formatDate(iso, "d MMM yyyy, HH:mm");
}

export function relativeDue(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = parseISO(iso);
  if (!isValid(date)) return null;
  const distance = formatDistanceToNowStrict(date);
  return date.getTime() < Date.now() ? `Overdue by ${distance}` : `Due in ${distance}`;
}

export const DOCUMENT_STATUS_META: Record<DocumentStatusValue, { label: string; tone: BadgeTone }> = {
  DRAFT: { label: "Draft", tone: "neutral" },
  PUBLISHED: { label: "Published", tone: "success" },
  ARCHIVED: { label: "Archived", tone: "warning" },
};

export const ESCALATION_TARGET_LABELS: Record<EscalationTargetValue, string> = {
  MANAGER: "Line manager",
  HR: "HR (document managers)",
  NONE: "No escalation",
};

/** One-line audience description, e.g. "Warehouse, Dublin Plant + 2 people". */
export function audienceLabel(audience: AudienceSummaryDto): string {
  if (audience.allEmployees) return "All employees";
  const parts = [...audience.roles, ...audience.businessUnits, ...audience.sites, ...audience.locations, ...audience.departments].map((x) => x.name);
  if (audience.users.length) parts.push(`${audience.users.length} ${audience.users.length === 1 ? "person" : "people"}`);
  if (!parts.length) return "No audience";
  return parts.length > 3 ? `${parts.slice(0, 3).join(", ")} +${parts.length - 3} more` : parts.join(", ");
}

export const AUDIT_ACTION_LABELS: Record<string, string> = {
  DOCUMENT_CREATED: "Document created",
  DOCUMENT_UPDATED: "Details updated",
  DOCUMENT_PUBLISHED: "Published",
  DOCUMENT_ARCHIVED: "Archived",
  DOCUMENT_RESTORED: "Restored",
  DOCUMENT_VERSION_ADDED: "New version uploaded",
  DOCUMENT_ACKNOWLEDGED: "Acknowledged",
  DOCUMENT_FILE_ACCESSED: "Opened file",
  DOCUMENT_ACKNOWLEDGEMENTS_EXPORTED: "Acknowledgements exported",
  DOCUMENT_SURVEY_CREATED: "Survey added",
  DOCUMENT_SURVEY_UPDATED: "Survey changed",
  DOCUMENT_SURVEY_CLOSED: "Survey closed",
  DOCUMENT_SURVEY_REOPENED: "Survey reopened",
  DOCUMENT_SURVEY_REPLACED: "Survey replaced",
  DOCUMENT_SURVEY_ANSWERED: "Answered the survey",
  DOCUMENT_SURVEY_REMINDED: "Survey reminder sent",
  DOCUMENT_SURVEY_EXPORTED: "Survey answers exported",
};

export function isInlinePreviewable(mimeType: string): "pdf" | "image" | "text" | null {
  if (mimeType === "application/pdf") return "pdf";
  if (/^image\/(png|jpe?g|gif|webp|bmp)$/.test(mimeType)) return "image";
  if (mimeType === "text/plain") return "text";
  return null;
}
