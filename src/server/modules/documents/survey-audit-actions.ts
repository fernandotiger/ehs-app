/** Audit and notification vocabulary for document surveys (entity type "Document"). */
export const SURVEY_AUDIT = {
  CREATED: "DOCUMENT_SURVEY_CREATED",
  UPDATED: "DOCUMENT_SURVEY_UPDATED",
  CLOSED: "DOCUMENT_SURVEY_CLOSED",
  REOPENED: "DOCUMENT_SURVEY_REOPENED",
  REPLACED: "DOCUMENT_SURVEY_REPLACED",
  /** Participation only – never the response id, the answers or whether it was anonymous. */
  ANSWERED: "DOCUMENT_SURVEY_ANSWERED",
  REMINDED: "DOCUMENT_SURVEY_REMINDED",
  EXPORTED: "DOCUMENT_SURVEY_EXPORTED",
} as const;

export const SURVEY_NOTIFICATIONS = {
  REQUIRED: "document.survey_required",
  AVAILABLE: "document.survey_available",
  REMINDER: "document.survey_reminder",
} as const;
