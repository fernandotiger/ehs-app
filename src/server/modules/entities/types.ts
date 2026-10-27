import type { ModuleKey } from "@/lib/modules";
import type { CurrentUser } from "@/server/auth/current-user";

/**
 * How the platform talks about a record it does not own (evidence, comments, record links,
 * notifications). Each module registers one descriptor per entity type in ./registry.ts.
 * All lookups run inside the caller's tenant context, so a foreign id is simply "not found".
 */
export interface EntityDescriptor {
  /** The module that owns the type; access is denied when the tenant has not enabled it. */
  module?: ModuleKey;
  /** Human label, e.g. "HR-POL-001 · Annual Leave Policy" (null when the record does not exist). */
  label(id: string): Promise<string | null>;
  /** In-app link to the record. */
  href(id: string): string;
  /** May the user open the record (and therefore read its evidence/comments/links)? */
  canView(user: CurrentUser, id: string): Promise<boolean>;
  /** May the user change the record (add/remove evidence, add links)? */
  canEdit(user: CurrentUser, id: string): Promise<boolean>;
}

export interface EntityRef {
  entityType: string;
  entityId: string;
}

export interface EntitySummary extends EntityRef {
  label: string;
  href: string;
}
