import { pickChanged, seedBoolean, seedEnum, seedIds, seedInt, seedObject, seedText } from "@/lib/favourites/seed";
import { ESCALATION_TARGETS, TAG_NAME_MAX, TAGS_PER_DOCUMENT_MAX, uniqueTagNames, type AckSettingsInput, type AudienceInput, type UpdateDocumentInput } from "@/lib/validation/documents";
import type { Lookups } from "@/features/shared/lookups";

/**
 * Upload document – what a favourite keeps (brief 09 §2B): the details (title, reference code,
 * category, tags, description), who should have access and the acknowledgement settings.
 *
 * Never kept: the file, and nothing at all when the page was filled in by Risk "Save as document"
 * (`?uploadId&title&description` – that page can't be a favourite, so the form registers no capture).
 * The audience and acknowledgement helpers are shared with Create response form (survey-seed.ts).
 */

/** Company structure and roles that exist now (unknown lists → no check). */
export interface KnownStructure {
  roleIds?: readonly string[];
  businessUnitIds?: readonly string[];
  siteIds?: readonly string[];
  locationIds?: readonly string[];
  departmentIds?: readonly string[];
}

export function knownStructureOf(lookups: Lookups | undefined): KnownStructure {
  if (!lookups) return {};
  const ids = (items: { id: string }[]) => items.map((i) => i.id);
  return {
    roleIds: ids(lookups.roles),
    businessUnitIds: ids(lookups.businessUnits),
    siteIds: ids(lookups.sites),
    locationIds: ids(lookups.locations),
    departmentIds: ids(lookups.departments),
  };
}

/** Audiences: roles and structure nodes that no longer exist are dropped (named people are checked when saving). */
export function mergeAudience(fresh: AudienceInput, saved: unknown, known: KnownStructure = {}): AudienceInput {
  const s = seedObject(saved);
  if (!s) return fresh;
  return {
    allEmployees: seedBoolean(s.allEmployees) ?? fresh.allEmployees,
    roleIds: seedIds(s.roleIds, 200, known.roleIds) ?? fresh.roleIds,
    businessUnitIds: seedIds(s.businessUnitIds, 200, known.businessUnitIds) ?? fresh.businessUnitIds,
    siteIds: seedIds(s.siteIds, 500, known.siteIds) ?? fresh.siteIds,
    locationIds: seedIds(s.locationIds, 500, known.locationIds) ?? fresh.locationIds,
    departmentIds: seedIds(s.departmentIds, 500, known.departmentIds) ?? fresh.departmentIds,
    userIds: seedIds(s.userIds, 2000) ?? fresh.userIds,
  };
}

/** Acknowledgement settings (numbers of days, never dates). `kept` = the favourite had them (the page then skips the system defaults). */
export function mergeAck(fresh: AckSettingsInput, saved: unknown): { ack: AckSettingsInput; kept: boolean } {
  const s = seedObject(saved);
  if (!s) return { ack: fresh, kept: false };
  return {
    ack: {
      requiresAcknowledgement: seedBoolean(s.requiresAcknowledgement) ?? fresh.requiresAcknowledgement,
      ackDueDays: seedInt(s.ackDueDays, 1, 365) ?? fresh.ackDueDays,
      reminderIntervalDays: seedInt(s.reminderIntervalDays, 1, 90) ?? fresh.reminderIntervalDays,
      escalationDays: seedInt(s.escalationDays, 0, 365) ?? fresh.escalationDays,
      escalationTarget: seedEnum(s.escalationTarget, ESCALATION_TARGETS) ?? fresh.escalationTarget,
    },
    kept: true,
  };
}

export function mergeTags(fresh: string[], saved: unknown): string[] {
  if (!Array.isArray(saved)) return fresh;
  return uniqueTagNames(saved.filter((t): t is string => typeof t === "string"))
    .filter((t) => t.length <= TAG_NAME_MAX)
    .slice(0, TAGS_PER_DOCUMENT_MAX);
}

const KEPT = ["title", "description", "referenceCode", "categoryName", "tags", "audience", "ack"] as const satisfies readonly (keyof UpdateDocumentInput)[];

export type DocumentSeed = Partial<UpdateDocumentInput>;

/** Capture: what the user changed from a fresh form (`fresh` = today's defaults, without any prefill). */
export function pickDocument(values: UpdateDocumentInput, fresh: UpdateDocumentInput): DocumentSeed {
  return pickChanged(values, fresh, KEPT);
}

/** Restore: the kept details and settings on top of a fresh form (no file). */
export function mergeDocument(fresh: UpdateDocumentInput, saved: unknown, context: { known?: KnownStructure } = {}): { values: UpdateDocumentInput; ackKept: boolean } {
  const s = seedObject(saved) ?? {};
  const ack = mergeAck(fresh.ack, s.ack);
  return {
    values: {
      title: seedText(s.title, 200) ?? fresh.title,
      description: seedText(s.description, 4000) ?? fresh.description,
      referenceCode: seedText(s.referenceCode, 50) ?? fresh.referenceCode,
      categoryName: seedText(s.categoryName, 80) ?? fresh.categoryName,
      tags: mergeTags(fresh.tags, s.tags),
      audience: mergeAudience(fresh.audience, s.audience, context.known),
      ack: ack.ack,
    },
    ackKept: ack.kept,
  };
}
