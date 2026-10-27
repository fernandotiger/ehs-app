/** Audit log vocabulary for the Documents module. */
export const DOCUMENT_ENTITY = "Document";
export const DOCUMENT_VERSION_ENTITY = "DocumentVersion";

export const DOCUMENT_AUDIT = {
  CREATED: "DOCUMENT_CREATED",
  UPDATED: "DOCUMENT_UPDATED",
  PUBLISHED: "DOCUMENT_PUBLISHED",
  ARCHIVED: "DOCUMENT_ARCHIVED",
  RESTORED: "DOCUMENT_RESTORED",
  VERSION_ADDED: "DOCUMENT_VERSION_ADDED",
  ACKNOWLEDGED: "DOCUMENT_ACKNOWLEDGED",
  FILE_ACCESSED: "DOCUMENT_FILE_ACCESSED",
  ACKNOWLEDGEMENTS_EXPORTED: "DOCUMENT_ACKNOWLEDGEMENTS_EXPORTED",
} as const;

/** Notification type keys (free strings, "<module>.<event>"). */
export const DOCUMENT_NOTIFICATIONS = {
  ASSIGNED: "document.assigned",
  ACK_REQUIRED: "document.ack_required",
  VERSION_ISSUED: "document.version_issued",
  ACK_REMINDER: "document.ack_reminder",
  ACK_ESCALATION: "document.ack_escalation",
} as const;

/** High-volume, per-employee entries hidden from the "changes" view of a document's history. */
export const PER_EMPLOYEE_AUDIT_ACTIONS: string[] = [DOCUMENT_AUDIT.FILE_ACCESSED, DOCUMENT_AUDIT.ACKNOWLEDGED, "DOCUMENT_SURVEY_ANSWERED"];
