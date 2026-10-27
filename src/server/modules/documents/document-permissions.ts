import { PERMISSIONS, type Permission } from "@/lib/permissions";

/** Permission sets for Documents endpoints (roles are data; code checks permissions only). */
export const DOCUMENT_PERMISSIONS = {
  /** Create, edit, version, publish, archive. */
  MANAGE: [PERMISSIONS.DOCUMENTS_MANAGE],
  /** Document library and management detail (read-only for reporters / view-all users). */
  LIBRARY: [PERMISSIONS.DOCUMENTS_MANAGE, PERMISSIONS.DOCUMENTS_VIEW_ALL, PERMISSIONS.DOCUMENTS_ACK_REPORTS],
  /** Acknowledgement reports, compliance dashboard, CSV exports, history. */
  REPORTS: [PERMISSIONS.DOCUMENTS_ACK_REPORTS, PERMISSIONS.DOCUMENTS_MANAGE],
} as const satisfies Record<string, readonly Permission[]>;
