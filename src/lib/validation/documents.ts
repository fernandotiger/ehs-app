import { z } from "zod";
import { idSchema, paginationQuerySchema } from "./common";
import { surveyDefinitionSchema } from "./document-surveys";

/**
 * Zod schemas for the Document Management module – shared by the client forms and the API.
 *
 * Form-facing schemas intentionally avoid transforms so their input and output types are
 * identical (react-hook-form friendly). Services normalise empty strings to null.
 */

/** The statement employees confirm. Stored verbatim on every acknowledgement. */
export const ACKNOWLEDGEMENT_STATEMENT = "I confirm that I have read and understood this document.";

export const DOCUMENT_STATUSES = ["DRAFT", "PUBLISHED", "ARCHIVED"] as const;
export type DocumentStatusValue = (typeof DOCUMENT_STATUSES)[number];

export const ESCALATION_TARGETS = ["MANAGER", "HR", "NONE"] as const;
export type EscalationTargetValue = (typeof ESCALATION_TARGETS)[number];

export const ACKNOWLEDGEMENT_SOURCES = ["ONLINE", "OFFLINE_SYNC"] as const;
export type AcknowledgementSource = (typeof ACKNOWLEDGEMENT_SOURCES)[number];

/**
 * Who a document is assigned to. A document may target several audiences at once; structure
 * audiences (business unit, site, location, department) match people by their home placement.
 */
export const audienceSchema = z
  .object({
    allEmployees: z.boolean(),
    roleIds: z.array(idSchema).max(200),
    businessUnitIds: z.array(idSchema).max(200),
    siteIds: z.array(idSchema).max(500),
    locationIds: z.array(idSchema).max(500),
    departmentIds: z.array(idSchema).max(500),
    userIds: z.array(idSchema).max(2000),
  })
  .refine((a) => a.allEmployees || audienceSize(a) > 0, {
    message: "Choose at least one audience",
    path: ["allEmployees"],
  });
export type AudienceInput = z.infer<typeof audienceSchema>;

/** Number of specific audiences chosen (roles, structure nodes and named people). */
export function audienceSize(a: Record<"roleIds" | "businessUnitIds" | "siteIds" | "locationIds" | "departmentIds" | "userIds", readonly string[]>): number {
  return a.roleIds.length + a.businessUnitIds.length + a.siteIds.length + a.locationIds.length + a.departmentIds.length + a.userIds.length;
}

export const EMPTY_AUDIENCE: AudienceInput = {
  allEmployees: false,
  roleIds: [],
  businessUnitIds: [],
  siteIds: [],
  locationIds: [],
  departmentIds: [],
  userIds: [],
};

export const ackSettingsSchema = z.object({
  requiresAcknowledgement: z.boolean(),
  ackDueDays: z.number({ error: "Enter a number of days" }).int().min(1).max(365),
  reminderIntervalDays: z.number({ error: "Enter a number of days" }).int().min(1).max(90),
  escalationDays: z.number({ error: "Enter a number of days" }).int().min(0).max(365),
  escalationTarget: z.enum(ESCALATION_TARGETS),
});
export type AckSettingsInput = z.infer<typeof ackSettingsSchema>;

export const TAG_NAME_MAX = 40;
export const TAGS_PER_DOCUMENT_MAX = 20;

/** A tag as shown: trimmed, inner whitespace collapsed to single spaces. */
export function cleanTagName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

/** Per-tenant uniqueness key: "Fire  Safety" and "fire safety" are the same tag. */
export function tagKey(name: string): string {
  return cleanTagName(name).toLowerCase();
}

/** Cleaned, non-empty names without case-insensitive duplicates (the first spelling wins), in input order. */
export function uniqueTagNames(names: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of names) {
    const name = cleanTagName(raw);
    const key = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

export const tagNamesSchema = z
  .array(z.string().trim().min(1, "A tag cannot be empty").max(TAG_NAME_MAX, `Keep tags to ${TAG_NAME_MAX} characters`))
  .max(TAGS_PER_DOCUMENT_MAX, `Use at most ${TAGS_PER_DOCUMENT_MAX} tags`);

export const documentMetadataSchema = z.object({
  title: z.string().trim().min(3, "Title must be at least 3 characters").max(200),
  description: z.string().trim().max(4000),
  referenceCode: z.string().trim().max(50),
  /** Existing category name or a new one (created on save). Empty = uncategorised. */
  categoryName: z.string().trim().max(80),
  /** Existing tag names or new ones (created on save, matched case-insensitively). */
  tags: tagNamesSchema,
});
export type DocumentMetadataInput = z.infer<typeof documentMetadataSchema>;

export const updateDocumentSchema = z.object({
  ...documentMetadataSchema.shape,
  audience: audienceSchema,
  ack: ackSettingsSchema,
});
export type UpdateDocumentInput = z.infer<typeof updateDocumentSchema>;

export const createDocumentSchema = z.object({
  ...updateDocumentSchema.shape,
  uploadId: idSchema,
  /** true = publish immediately, false = save as draft. */
  publish: z.boolean(),
  /** Optional survey created with the document (goes live when it is published). */
  survey: surveyDefinitionSchema.nullish(),
});
export type CreateDocumentInput = z.infer<typeof createDocumentSchema>;

/** Acknowledging means confirming you have read a file – without one there is nothing to confirm. */
export const ACK_NEEDS_FILE = "Add a file to ask people to confirm they have read it.";

/**
 * POST /api/documents/surveys – the Survey page: a survey with an optional file people open first.
 * No document details are asked; the document takes the survey's title and introduction.
 */
export const createSurveyDocumentSchema = z
  .object({
    survey: surveyDefinitionSchema,
    audience: audienceSchema,
    ack: ackSettingsSchema,
    /** Null = a survey on its own, with nothing to read first. */
    uploadId: idSchema.nullish(),
    publish: z.boolean(),
  })
  .refine((v) => Boolean(v.uploadId) || !v.ack.requiresAcknowledgement, { message: ACK_NEEDS_FILE, path: ["ack", "requiresAcknowledgement"] });
export type CreateSurveyDocumentInput = z.infer<typeof createSurveyDocumentSchema>;

export const newVersionSchema = z.object({
  uploadId: idSchema,
  changeNote: z.string().trim().max(1000),
  /** Employees must acknowledge the new version again (ignored when acknowledgement is off). */
  requireReacknowledgement: z.boolean(),
});
export type NewVersionInput = z.infer<typeof newVersionSchema>;

export const acknowledgeSchema = z.object({
  versionId: idSchema,
});
export type AcknowledgeInput = z.infer<typeof acknowledgeSchema>;

/** Payload of the `document.acknowledge` offline outbox operation. */
export const offlineAcknowledgePayloadSchema = z.object({
  documentId: idSchema,
  versionId: idSchema,
  clientAcknowledgedAt: z.string().datetime(),
});
export type OfflineAcknowledgePayload = z.infer<typeof offlineAcknowledgePayloadSchema>;

export const MY_DOCUMENT_FILTERS = ["all", "action", "acknowledged"] as const;
export type MyDocumentFilter = (typeof MY_DOCUMENT_FILTERS)[number];

export const myDocumentsQuerySchema = paginationQuerySchema.extend({
  categoryId: idSchema.optional(),
  tagId: idSchema.optional(),
  filter: z.enum(MY_DOCUMENT_FILTERS).default("all"),
});
export type MyDocumentsQuery = z.infer<typeof myDocumentsQuerySchema>;

/** My Surveys: "todo" = open surveys I haven't answered (plus any acknowledgement still to give). */
export const MY_SURVEY_FILTERS = ["all", "todo", "answered"] as const;
export type MySurveyFilter = (typeof MY_SURVEY_FILTERS)[number];

export const mySurveysQuerySchema = paginationQuerySchema.extend({
  filter: z.enum(MY_SURVEY_FILTERS).default("all"),
});
export type MySurveysQuery = z.infer<typeof mySurveysQuerySchema>;

/** "ACTIVE" = draft + published (Scannell parity: active/archived filter). */
export const LIBRARY_STATUS_FILTERS = ["ACTIVE", "ALL", ...DOCUMENT_STATUSES] as const;
export type LibraryStatusFilter = (typeof LIBRARY_STATUS_FILTERS)[number];

/** Document Library lists "document"s, Survey Library "survey"s (documents with a current survey). */
export const LIBRARY_TYPE_FILTERS = ["survey", "document"] as const;
export type LibraryTypeFilter = (typeof LIBRARY_TYPE_FILTERS)[number];

export const libraryQuerySchema = paginationQuerySchema.extend({
  categoryId: idSchema.optional(),
  tagId: idSchema.optional(),
  status: z.enum(LIBRARY_STATUS_FILTERS).default("ACTIVE"),
  type: z.enum(LIBRARY_TYPE_FILTERS).default("document"),
  /** "me" = only what the signed-in user created (Survey Library → "Created by me"). */
  createdBy: z.enum(["me"]).optional(),
});
export type LibraryQuery = z.infer<typeof libraryQuerySchema>;

/** GET /api/documents/tags: "library" = every tag (managers, for tagging and the library filter); "mine" = tags on documents assigned to me. */
export const tagListQuerySchema = z.object({
  scope: z.enum(["library", "mine"]).default("mine"),
});
export type TagListQuery = z.infer<typeof tagListQuerySchema>;

export const ACK_REPORT_STATUSES =["acknowledged", "outstanding", "overdue"] as const;
export type AckReportStatus = (typeof ACK_REPORT_STATUSES)[number];

export const ackReportQuerySchema = paginationQuerySchema.extend({
  status: z.enum(ACK_REPORT_STATUSES).default("outstanding"),
  departmentId: idSchema.optional(),
  locationId: idSchema.optional(),
});
export type AckReportQuery = z.infer<typeof ackReportQuerySchema>;

export const ackExportQuerySchema = z.object({
  status: z.enum(["acknowledged", "outstanding"]).default("acknowledged"),
  departmentId: idSchema.optional(),
  locationId: idSchema.optional(),
});
export type AckExportQuery = z.infer<typeof ackExportQuerySchema>;

export const documentAuditQuerySchema = paginationQuerySchema.extend({
  /** "changes" hides per-employee file access and acknowledgement entries. */
  kind: z.enum(["changes", "all"]).default("changes"),
});
export type DocumentAuditQuery = z.infer<typeof documentAuditQuerySchema>;

export const complianceQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(10),
});

export const fileQuerySchema = z.object({
  download: z.enum(["0", "1"]).optional(),
});
